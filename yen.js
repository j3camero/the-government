const DiscordUtil = require('./discord-util');
const { exchangeRates } = require('exchange-rates-api');
const moment = require('moment');
const UserCache = require('./user-cache');

const threeTicks = '```';

async function HandleYenCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    await discordMessage.channel.send('```Current balance: ' + `${cu.yen}` + ' yen```');
}

function IsDigit(s) {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return s in digits;
}

function IsDigitString(s) {
    if (s.length === 0) {
	return false;
    }
    for (let i = 0; i < s.length; i++) {
	if (!IsDigit(s[i])) {
	    return false;
	}
    }
    return true;
}

function ExactlyOneOfTwoStringsMustBeAnInteger(a, b) {
    const aIsDigitString = IsDigitString(a);
    const bIsDigitString = IsDigitString(b);
    if (aIsDigitString && !bIsDigitString) {
	return parseInt(a);
    }
    if (!aIsDigitString && bIsDigitString) {
	return parseInt(b);
    }
    return null;
}

async function CalculateInactivityTaxBase() {
    const tax = {};
    const r = Math.log(2) / 90;
    await UserCache.ForEach((user) => {
	if (!user.yen) {
	    // Users with no yen can't pay tax.
	    return;
	}
	if (user.yen <= 1) {
	    // Users with 1 or fewer yen are exempt from the tax.
	    return;
	}
	if (!user.last_seen) {
	    // Users that have never been seen for whatever reason don't pay tax.
	    return;
	}
	const lastSeen = moment(user.last_seen);
	const gracePeriodEnd = lastSeen.add(90, 'days');
	const currentTime = moment();
	if (gracePeriodEnd.isAfter(currentTime)) {
	    // Recently active users don't pay tax. Only inactive ones.
	    return;
	}
	let paidUntil;
	if (user.inactivity_tax_paid_until) {
	    paidUntil = moment(user.inactivity_tax_paid_until);
	} else {
	    paidUntil = gracePeriodEnd;
	}
	if (gracePeriodEnd.isAfter(paidUntil)) {
	    paidUntil = gracePeriodEnd;
	}
	const elapsedSeconds = currentTime.diff(paidUntil, 'seconds');
	const elapsedDays = elapsedSeconds / 86400;
	const t = user.yen * (1 - Math.exp(-r * elapsedDays));
	const taxOwing = Math.floor(t);
	if (taxOwing > 0) {
	    tax[user.commissar_id] = taxOwing;
	}
    });
    return tax;
}

async function UpdateTaxChannel() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const taxChannelId = '1012023632312156311';
    const channel = await guild.channels.resolve(taxChannelId);
    await channel.bulkDelete(99);
    let message = '';
    const taxBase = await CalculateInactivityTaxBase();
    const n = Object.keys(taxBase).length;
    const sortedTaxBase = [];
    let totalTax = 0;
    for (const cid in taxBase) {
	const tax = taxBase[cid];
	totalTax += tax;
	const user = UserCache.GetCachedUserByCommissarId(cid);
	const name = user.getNicknameOrTitleWithInsignia();
	sortedTaxBase.push({tax, name});
    }
    sortedTaxBase.sort((a, b) => {
	if (a.tax < b.tax) {
	    return -1;
	}
	if (a.tax > b.tax) {
	    return 1;
	}
	return 0;
    });
    if (n === 0) {
	message = 'There is no tax revenue to spend at this time.';
	await channel.send(threeTicks + message + threeTicks);
	return;
    }
    message += 'Inactivity Tax\n';
    message += '--------------\n';
    message += 'Tax is how we keep the yen in circulation. Members inactive from VC longer than 90 days have their yen taxed at a slow rate. You can avoid tax completely by connecting to VC every 3 months.\n\n';
    message += 'Currently available tax revenues:\n\n';
    for (const taxpayer of sortedTaxBase) {
	message += `¥ ${taxpayer.tax} ${taxpayer.name}\n`;
    }
    message += '-----\n';
    message += `¥ ${totalTax} Total\n\n`;
    message += 'Mr. or Madam President is responsible for Government spending. They are encouraged to spend all available tax revenue to bring inactive yen back into circulation. To spend tax money,\n\n';
    message += `!tax @RecipientName 17`;
    await channel.send(threeTicks + message + threeTicks);
}

async function CalculateTaxPlan(yenToRaise) {
    if (yenToRaise === 0) {
	return null;
    }
    const taxBase = await CalculateInactivityTaxBase();
    let totalBase = 0;
    for (const cid in taxBase) {
	totalBase += taxBase[cid];
    }
    if (yenToRaise > totalBase) {
	return null;
    }
    const taxPlan = {};
    let raised = 0;
    for (const cid in taxBase) {
	const tax = Math.floor(taxBase[cid] * yenToRaise / totalBase);
	if (tax > 0) {
	    taxPlan[cid] = tax;
	    raised += tax;
	}
    }
    for (const cid in taxBase) {
	const tax = taxPlan[cid] || 0;
	if (raised < yenToRaise && tax < taxBase[cid]) {
	    taxPlan[cid] = tax + 1;
	    raised += 1;
	}
    }
    return taxPlan;
}

async function HandleTaxCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 3) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!pay @Jeff 42`');
	return;
    }
    const amount = ExactlyOneOfTwoStringsMustBeAnInteger(tokens[1], tokens[2]);
    if (!amount || amount === null || amount === 0) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!pay @Jeff 42`');
	return;
    }
    const plan = await CalculateTaxPlan(amount);
    console.log('TAX PLAN');
    console.log(plan);
    await UpdateTaxChannel();
}

async function UpdateYenChannel() {
    const users = [];
    await UserCache.ForEach((user) => {
	if (user.yen > 0) {
	    users.push(user);
	}
    });
    users.sort((a, b) => {
	if (a.yen < b.yen) {
	    return 1;
	}
	if (a.yen > b.yen) {
	    return -1;
	}
	return 0;
    });
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const yenChannelId = '1007017809492070522';
    const channel = await guild.channels.resolve(yenChannelId);
    await channel.bulkDelete(99);
    let message = '';
    let savedMessage;
    let rank = 1;
    let maxYenDigits;
    let totalYen = 0;
    for (const user of users) {
	const yenString = `¥ ${user.yen}`;
	if (!maxYenDigits) {
	    maxYenDigits = yenString.length;
	}
	const paddedYen = yenString.padStart(maxYenDigits);
	const name = user.getNicknameOrTitleWithInsignia();
	const rankString = rank.toString().padStart(3);
	rank++;
	message += `${rankString}. ${paddedYen} ${name}\n`;
	if (message.length > 1800) {
	    await channel.send(threeTicks + message + threeTicks);
	    message = '';
	}
	totalYen += user.yen;
    }
    if (message.length !== 0) {
	await channel.send(threeTicks + message + threeTicks);
    }
    const jeffSteamInventoryValue = 19309;
    const reserveRatio = jeffSteamInventoryValue / totalYen;
    const formattedReserveRatio = parseInt(reserveRatio * 100);
    message = '';
    message += `Total yen in circulation: ¥ ${totalYen}\n`;
    message += `Liquidation value of Jeff's Rust skins (Sept 2022): ¥ ${jeffSteamInventoryValue}\n`;
    message += `Reserve ratio: ${formattedReserveRatio}%\n`;
    await channel.send(threeTicks + message + threeTicks);
}

async function YenLog(message) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const logChannelId = '1007018312158429184';
    const channel = await guild.channels.resolve(logChannelId);
    await channel.send(threeTicks + message + threeTicks);
}

async function Pay(sender, recipient, amount, discordMessage) {
    const senderYenBefore = sender.yen;
    const payeeYenBefore = recipient.yen;
    const senderYenAfter = senderYenBefore - amount;
    const payeeYenAfter = payeeYenBefore + amount;
    await sender.setYen(senderYenAfter);
    await recipient.setYen(payeeYenAfter);
    const senderName = sender.getNicknameOrTitleWithInsignia();
    const payeeName = recipient.getNicknameOrTitleWithInsignia();
    const sweet = Math.random() < 0.1 ? 'of those sweet sweet ' : '';
    const message = `${senderName} sent ${amount} ${sweet}yen to ${payeeName}`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
}

async function HandlePayCommandWithAmount(discordMessage, amount) {
    const authorDiscordId = discordMessage.author.id;
    const authorCommissarUser = await UserCache.GetCachedUserByDiscordId(authorDiscordId);
    if (!authorCommissarUser) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (authorCommissarUser.yen < amount) {
	await discordMessage.channel.send('You don\'t have enough yen.');
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send('Invalid payee. You must specify who to send yen to. Example: `!pay @Jeff 42`');
	return;
    }
    const mentionedDiscordId = mentionedMember.user.id;
    if (mentionedDiscordId === authorDiscordId) {
	await discordMessage.channel.send('Invalid payee. You You can\'t pay yourself.');
	return;
    }
    const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedDiscordId);
    if (!mentionedCommissarUser) {
	await discordMessage.channel.send('Error. Invalid recipient for funds.');
	return;
    }
    await Pay(authorCommissarUser, mentionedCommissarUser, amount, discordMessage);
    await UpdateYenChannel();
    await UpdateTaxChannel();
}

async function HandlePayCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 3) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!pay @Jeff 42`');
	return;
    }
    const amount = ExactlyOneOfTwoStringsMustBeAnInteger(tokens[1], tokens[2]);
    if (!amount || amount === null || amount === 0) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!pay @Jeff 42`');
	return;
    }
    await HandlePayCommandWithAmount(discordMessage, amount);
}

async function HandleTipCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!tip @Jeff`');
	return;
    }
    const amount = 1;
    await HandlePayCommandWithAmount(discordMessage, amount);
}

async function HandleYenCreateCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (cu.commissar_id !== 7) {
	// Only Jeff (user 7) can use this command.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!yencreate 100`');
	return;
    }
    let amount;
    try {
	amount = parseInt(tokens[1]);
    } catch (error) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!yencreate 100`');
	return;
    }
    const yenBefore = cu.yen;
    const yenAfter = yenBefore + amount;
    await cu.setYen(yenAfter);
    const message = `Minted ${amount} brand new yen.`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
    await UpdateYenChannel();
    await UpdateTaxChannel();
}

async function HandleYenDestroyCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (cu.commissar_id !== 7) {
	// Only Jeff (user 7) can use this command.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!yendestroy 100`');
	return;
    }
    let amount;
    try {
	amount = parseInt(tokens[1]);
    } catch (error) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!yendestroy 100`');
	return;
    }
    const yenBefore = cu.yen;
    const yenAfter = Math.max(yenBefore - amount, 0);
    await cu.setYen(yenAfter);
    const name = cu.getNicknameOrTitleWithInsignia();
    const message = `Took ${amount} yen out of circulation.`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
    await UpdateYenChannel();
}

async function HandleYenFaqCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	return;
    }
    if (cu.commissar_id !== 7) {
	return;
    }
    await discordMessage.channel.send(
	"**What is a yen?**\n" +
	"Yen is the official currency of The Government. Its value is pegged to the actual Japanese Yen (JPY). You can think of them as being worth about 1 American penny each. See how many yen you have with\n" +
	"```!yen```\n");
    await discordMessage.channel.send(
	"**How can I get some yen?**\n" +
	"A few ways. Ask Mr. or Madam President what needs doing. They usually have some yen. Trade valuable items in game for yen. Place in the top 3 of a PVP Tournament for cash prizes in yen.\n" +
	"You can get fresh yen by depositing valuable Rust skins with Jeff in the Steam Marketplace.\n");
    await discordMessage.channel.send(
	"**How can I spend yen?**\n" +
	"Send yen to other members of The Government with\n" +
	"```!pay @RecipientName amount```\n" +
	"For example:\n" +
	"```!pay @Jeff 42```\n" +
	"You can give someone a quick thumbs-up by sending them one yen\n" +
	"```!tip @Jeff```\n" +
	"Potential uses for yen: trading items in game, prizes for contests, government contracts from Mr. President, trading Rust skins, tipping/gifting, settling small real-world debts, bribing your way out of Ban Court, role playing shopkeeper with real money, and much more. Can't wait to see what you creative capitalists will come up with.\n");
    await discordMessage.channel.send(
	"**Do yen have real-world cash value?**\n" +
	"Yes. The yen can be freely exchanged for USD at real-world exchange rates, and vice-versa. That makes them pretty much real money.\n");
    await discordMessage.channel.send(
	"**How do I trade my yen for real-world cash?**\n" +
	"Check out Jeff's Steam Inventory. Pick a Rust skin of the monetary value you want to withdraw. Send a one-way trade to Jeff for that item. Use !pay to send the equivalent amount of yen to Jeff. Jeff will accept the trade through Steam and destroy the yen, taking it out of circulation. Withdrawals are processed at exactly the same rate as deposits: the sell price in Steam Marketplace.\n");
    await discordMessage.channel.send(
	"**What about the other way around? Can I trade real-world cash for yen?**\n" +
	"Yes. Use your real-world cash to buy a Rust skin. Then deposit it in Jeff's inventory using a one-way trade. Jeff will create the equivalent amount of new yen and send it to you.\n");
    await discordMessage.channel.send(
	"**What backs the yen?**\n" +
	"Yen are backed by real-world assets: Rust skins in the Steam Marketplace. Skins are in turn freely convertible to real cash: USD and JPY. yen are freely exchangeable for skins in both directions at the same price, with no fees at all. The reserve ratio will always stay above 200% so that each yen is double-backed. This way, users of the yen can always count on trading every last yen for high-priced, desirable Steam skins. Confidence in the yen will never be shaken. The yen is real money.\n");
    await discordMessage.channel.send(
	"**What if there is a bank run?**\n" +
	"Every last yen in circulation is backed by a minimum of twice its value in liquid assets. This means that in the case of a bank run, the last person to withdraw their yen will still be left with a large selection of Rust skins to choose from at a variety of price points. There will be no issue with the last person being left with scraps to choose from. We can have confidence that every last yen in circulation is fully backed, and then some.\n");
    await discordMessage.channel.send(
	"**Is there a limit to how many yen can be in circulation?**\n" +
	"In practice, yes. Each yen in circulation is double-backed at a minimum: once by assets desposited by members, plus a second time by Jeff's Rust skin inventory. The total value of Jeff's Steam inventory (about 30,000 yen or $210 USD) is the limit of how many yen can be in circulation.\n");
    await discordMessage.channel.send(
	"**Are there any fees?**\n" +
	"No. yen can be exchanged for Rust skins at the same price as they were deposited: the sell price in Steam Marketplace. There is no fee for withdrawing or depositing yen, or sending yen between members. Your yen will never be taken and are yours to keep forever.\n");
    await discordMessage.channel.send(
	"**Do the yen ever wipe?**\n" +
	"No. Yen balances last forever, until you spend them. There is no tax for keeping your yen forever. They will always keep their value.\n");
    await discordMessage.channel.send(
	"**What is the long-term plan for guaranteeing the stability of the yen?**\n" +
	"The reserve ratio will be kept above 200% at all times. Every yen in circulation is backed twice over. It will never be allowed to create new yen out of nowhere, without depositing valueable, highly liquid Rust skins. Yen withdrawn from the system will be permanently destroyed, as they are no longer backed by assets.\n");
    await discordMessage.channel.send(
	"**Where did the first yen come from?**\n" +
	"Jeff created the very first yen by staking his own Rust skins. Anyone can create more yen by staking some of their Rust skins.\n");
    await discordMessage.channel.send(
	"**What is the plan for putting the yen into wide circulation?**\n" +
	"The first yen will circulate by donating fully-backed yen to Mr. President to spend as a Government budget each month. Get yen for contributing upkeep to the community base and such. Cash prizes for PVP Tournaments and other events. Trading in-game loot between members for yen will be encouraged. Tipping (sending someone 1 yen) will be encouraged as a way to add oomph to reactions in Discord.\n");
    await discordMessage.channel.send(
	"**If anyone can create new yen by depositing Rust skins, doesn't that debase the existing yen causing inflation?**\n" +
	"No. Each and every single yen in circulation is fully backed. Like the gold standard. It is a stablecoin, pegged to the value of actual Japanese Yen (JPY).\n");
    await discordMessage.channel.send(
	"**Does Government spending of yen cause inflation?**\n" +
	"No. The yen that Mr. President spends on behalf of The Government come from donations of fully-backed yen by Government members. The Government does not spend newly printed yen.\n");
    await discordMessage.channel.send(
	"**Is yen a cryptocurrency?**\n" +
	"No. Government yen are a traditional, centrally issued fiat currency. The're boring. The balances are stored in a central database. With backups of course!\n" +
	"The value of the yen is pegged to the value of the actual Japanese Yen (JPY). They are similar in value to an American penny (1 cent).\n");
    await discordMessage.channel.send(
	"**Is this even legal?**\n" +
	"No. Definitely not. But...\n" +
	"The amount of yen in circulation is capped to a few hundred US dollars worth. Legally speaking, it is like a game of penny poker. Like penny poker, the tokens are real cash with real-world value.\n" +
	"We have a public ledger of who has how much yen, making The Government the world's most transparent offshore tax haven.\n");
//    await discordMessage.channel.send(
//	"**?**\n" +
//	"\n" +
//	"\n");
}

let cachedUsdJpyExchangeRate;
let cacheTime;

async function GetCachedUsdJpyExchangeRate() {
    const currentTime = new Date().getTime();
    const cacheAge = currentTime - cacheTime;
    const oneMinute = 60 * 1000;
    if (cachedUsdJpyExchangeRate && cacheTime && cacheAge < oneMinute) {
	return cachedUsdJpyExchangeRate;
    }
    const rate = await exchangeRates()
	  .setApiBaseUrl('https://api.exchangerate.host')
	  .latest()
	  .base('USD')
	  .symbols(['JPY'])
	  .fetch();
    if (!rate) {
	return cachedUsdJpyExchangeRate;
    }
    cachedUsdJpyExchangeRate = rate;
    cacheTime = currentTime;
    return cachedUsdJpyExchangeRate;
}

async function HandleConvertCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!convert 42`');
	return;
    }
    let amount;
    try {
	amount = parseFloat(tokens[1]);
    } catch (error) {
	await discordMessage.channel.send('Error. Invalid number. Example: `!convert 3.50`');
	return;
    }
    const fxRate = await GetCachedUsdJpyExchangeRate();
    if (!fxRate) {
	await discordMessage.channel.send('Error. Problem fetching the latest JPYUSD fx rate.`');
	return;
    }
    const usd = amount / fxRate;
    const yen = amount * fxRate;
    const usdString = usd.toFixed(2);
    const yenString = yen.toFixed();
    let message = '';
    message += `At current market exchange rates\n`;
    message += `¥ ${amount} = $ ${usdString} USD\n`;
    message += `$ ${amount} = ¥ ${yenString} JPY`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
}

module.exports = {
    HandleConvertCommand,
    HandlePayCommand,
    HandleTaxCommand,
    HandleTipCommand,
    HandleYenCommand,
    HandleYenCreateCommand,
    HandleYenDestroyCommand,
    HandleYenFaqCommand,
};
