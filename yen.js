const DiscordUtil = require('./discord-util');
const { exchangeRates } = require('exchange-rates-api');
const moment = require('moment');
const UserCache = require('./user-cache');

const threeTicks = '```';

async function HandleYenCommand(discordMessage) {
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (mentionedMember) {
	const discordId = mentionedMember.id;
	const cu = await UserCache.GetCachedUserByDiscordId(discordId);
	const name = cu.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(threeTicks + `${name} has ${cu.yen} yen` + threeTicks);
    } else {
	const discordId = discordMessage.author.id;
	const cu = await UserCache.GetCachedUserByDiscordId(discordId);
	await discordMessage.channel.send('```Current balance: ' + `${cu.yen}` + ' yen```');
    }
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

async function CalculateInactivityTaxForecast() {
    let forecast = 0;
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
	// Calculate expected tax over the next 30 days.
	const days = 30;
	const t = user.yen * (1 - Math.exp(-r * days));
	forecast += t;
    });
    return Math.floor(forecast);
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

async function ChooseRandomInactiveUserWeightedByYen() {
    let totalTaxBase = 0;
    const inactiveUsers = [];
    await UserCache.ForEach((user) => {
	if (!user.yen) {
	    // Users with no yen can't pay tax.
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
	inactiveUsers.push(user);
	totalTaxBase += user.yen;
    });
    if (totalTaxBase === 0) {
	return null;
    }
    inactiveUsers.sort((a, b) => (a.commissar_id - b.commissar_id));
    const r = Math.random() * totalTaxBase;
    let cumulativeTax = 0;
    for (const user of inactiveUsers) {
	cumulativeTax += user.yen;
	if (cumulativeTax >= r) {
	    return user;
	}
    }
    // Shouldn't get here.
    return null;
}

async function UpdateTaxChannel() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const taxChannelId = '1012023632312156311';
    const channel = await guild.channels.resolve(taxChannelId);
    await channel.bulkDelete(99);
    const taxBase = await CalculateInactivityTaxBase();
    const taxForecast = await CalculateInactivityTaxForecast();
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
	    return 1;
	}
	if (a.tax > b.tax) {
	    return -1;
	}
	return 0;
    });
    let message = '';
    if (n === 0) {
	message = 'There is no tax revenue to spend at this time.';
	await channel.send(threeTicks + message + threeTicks);
	return;
    }
    message += 'Inactivity Tax\n';
    message += '--------------\n';
    message += 'Tax is how we keep the yen in circulation. Members inactive from VC longer than 90 days have their yen taxed at a slow rate. You can avoid tax completely by connecting to VC every 3 months.\n\n';
    message += 'Currently available tax revenues:\n\n';
    await channel.send(threeTicks + message + threeTicks);
    const lines = [];
    for (const taxpayer of sortedTaxBase) {
	lines.push(`¥ ${taxpayer.tax} ${taxpayer.name}`);
    }
    await DiscordUtil.SendLongList(lines, channel);
    message = '-----\n';
    message += `¥ ${totalTax} Total\n\n`;
    message += `Expected new Government revenues over the next 30 days: ¥ ${taxForecast}\n\n`;
    message += 'Mr. or Madam President is responsible for Government spending. They are encouraged to spend all available tax revenue to bring inactive yen back into circulation. To spend tax money,\n\n';
    message += `!tax @RecipientName 17`;
    await channel.send(threeTicks + message + threeTicks);
}

// Update the tax channel once after the bot boots.
setTimeout(async () => {
    await UpdateTaxChannel();
}, 60 * 1000);
// Lottery once an hour.
setInterval(async () => {
    await DoLottery();
}, 3600 * 1000);

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
    const plan = {};
    let raised = 0;
    for (const cid in taxBase) {
	const tax = Math.floor(taxBase[cid] * yenToRaise / totalBase);
	if (tax > 0) {
	    plan[cid] = tax;
	    raised += tax;
	}
    }
    for (const cid in taxBase) {
	const tax = plan[cid] || 0;
	if (raised < yenToRaise && tax < taxBase[cid]) {
	    plan[cid] = tax + 1;
	    raised += 1;
	}
    }
    return plan;
}

async function ImplementTaxPlan(plan, recipient) {
    let totalTax = 0;
    let longMessage = 'Tax Record\n\n';
    const sortable = [];
    for (const cid in plan) {
	const tax = plan[cid];
	totalTax += tax;
	const user = UserCache.GetCachedUserByCommissarId(cid);
	const name = user.getNicknameOrTitleWithInsignia();
	const text = `- ¥ ${tax} ${name}\n`;
	sortable.push({ tax, text });
    }
    sortable.sort((a, b) => b.tax - a.tax);
    for (const line of sortable) {
	longMessage += line.text;
    }
    longMessage += '  -----\n';
    const recipientName = recipient.getNicknameOrTitleWithInsignia();
    longMessage += `+ ¥ ${totalTax} ${recipientName}\n\n`;
    longMessage += 'See #tax for more info about tax. Active members are never taxed. You can easily dodge tax by connecting to VC every 3 months. The goal of tax is to give the Government a steady source of revenue by putting inactive yen back into circulation.';
    await YenLog(longMessage);
    const shortMessage = `${recipientName} won ${totalTax} yen in the lottery`;
    await DiscordUtil.MessagePublicChatChannel(threeTicks + shortMessage + threeTicks);
    const r = Math.log(2) / 90;
    for (const cid in plan) {
	const tax = plan[cid];
	const user = UserCache.GetCachedUserByCommissarId(cid);
	if (!user.yen || user.yen === 0 || tax === 0) {
	    continue;
	}
	const lastSeen = moment(user.last_seen);
	const gracePeriodEnd = lastSeen.add(90, 'days');
	let paidUntil;
	if (user.inactivity_tax_paid_until) {
	    paidUntil = moment(user.inactivity_tax_paid_until);
	} else {
	    paidUntil = gracePeriodEnd;
	}
	if (gracePeriodEnd.isAfter(paidUntil)) {
	    paidUntil = gracePeriodEnd;
	}
	const days = -Math.log(1 - tax / user.yen) / r;
	const seconds = days * 86400;
	const newPaidUntil = paidUntil.add(seconds, 'seconds');
	await Pay(user, recipient, tax, null);
	await user.setInactivityTaxPaidUntil(newPaidUntil.format());
    }
}

async function HandleTaxCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    const isFounder = author.commissar_id === 7;
    const isPrez = author.office === 'PREZ';
    const isCfo = author.commissar_id === 2799;
    const ok = isFounder || isPrez || isCfo;
    console.log('TAX COMMAND', isFounder, isPrez, isCfo);
    if (!author || !ok) {
	await discordMessage.channel.send('Only the elected President can do that.');
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
    if (!plan) {
	await discordMessage.channel.send('Could not raise that amount of tax revenue.');
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send('Invalid recipient. You must specify who to send yen to. Example: `!tax @Jeff 17`');
	return;
    }
    const mentionedDiscordId = mentionedMember.user.id;
    if (mentionedDiscordId === discordMessage.author.id) {
	await discordMessage.channel.send('No embezzling of tax funds LOL');
	return;
    }
    const recipient = await UserCache.GetCachedUserByDiscordId(mentionedDiscordId);
    if (!recipient) {
	await discordMessage.channel.send('Error. Invalid recipient for funds.');
	return;
    }
    await ImplementTaxPlan(plan, recipient, discordMessage);
    await UpdateYenChannel();
    await UpdateTaxChannel();
}

async function DoLottery() {
    console.log('LOTTERY');
    const taxBase = await CalculateInactivityTaxBase();
    let totalTaxBase = 0;
    for (const i in taxBase) {
	totalTaxBase += taxBase[i];
    }
    console.log('totalTaxBase', totalTaxBase);
    const maxPrizeYen = 10;
    const targetPrize = Math.floor(0.1 * totalTaxBase);
    console.log('targetPrize', targetPrize);
    const prizeYen = Math.min(targetPrize, maxPrizeYen);
    const plan = await CalculateTaxPlan(prizeYen);
    if (!plan) {
	console.log('Could not raise enough tax revenue for lottery.');
	return;
    }
    console.log('Tax Plan', plan);
    const membersInVoiceChat = [];
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const [channelId, channel] of guild.channels.cache) {
	const afkLoungeId = '703716669452714054';
	if (channel.type === 2 && channel.id !== afkLoungeId) {
	    for (const [memberId, member] of channel.members) {
		membersInVoiceChat.push(member.id);
	    }
	}
    }
    const n = membersInVoiceChat.length;
    console.log(n, 'people in voice chat');
    if (n < 2) {
	console.log('Not enough people in voice chat for lottery.');
	return;
    }
    const randomIndex = Math.floor(Math.random() * n);
    const winnerId = membersInVoiceChat[randomIndex];
    console.log('winnerId', winnerId);
    const recipient = await UserCache.GetCachedUserByDiscordId(winnerId);
    if (!recipient) {
	console.log('Error. Invalid lottery winner.');
	return;
    }
    console.log('Implementing lottery tax plan');
    await ImplementTaxPlan(plan, recipient);
    await UpdateYenChannel();
    await UpdateTaxChannel();
}

async function UpdateYenChannel() {
    const users = [];
    await UserCache.ForEach((user) => {
	if (user.yen > 0) {
	    users.push(user);
	}
    });
    const n = users.length;
    users.sort((a, b) => {
	if (a.yen < b.yen) {
	    return 1;
	}
	if (a.yen > b.yen) {
	    return -1;
	}
	return 0;
    });
    const lines = [];
    let savedMessage;
    let totalYen = 0;
    let activeYen = 0;
    for (let i = 0; i < n; i++) {
	const user = users[i];
	const name = user.getNicknameOrTitleWithInsignia();
	const rank = i + 1;
	const line = `${rank}. ¥ ${user.yen} ${name}`;
	lines.push(line);
	totalYen += user.yen;
	if (user.last_seen) {
	    const lastSeen = moment(user.last_seen);
	    const gracePeriodEnd = lastSeen.add(90, 'days');
	    const currentTime = moment();
	    if (gracePeriodEnd.isAfter(currentTime)) {
		activeYen += user.yen;
	    }
	}
    }
    const inactiveYen = totalYen - activeYen;
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const yenChannelId = '1007017809492070522';
    const channel = await guild.channels.resolve(yenChannelId);
    await channel.bulkDelete(99);
    await DiscordUtil.SendLongList(lines, channel);
    const jeffSteamInventoryValue = 121462;
    const reserveRatio = jeffSteamInventoryValue / totalYen;
    const formattedReserveRatio = parseInt(reserveRatio * 100);
    const formattedActiveYenPercent = parseInt(100 * activeYen / totalYen);
    let message = '';
    message += `Total yen in circulation: ¥ ${totalYen}\n`;
    message += `Liquidation value of Jeff's Rust skins (Nov 2023): ¥ ${jeffSteamInventoryValue}\n`;
    message += `Reserve ratio: ${formattedReserveRatio}%\n`;
    message += `All recently active members (90d): ¥ ${activeYen} (${formattedActiveYenPercent}%)\n`;
    message += `Inactive members: ¥ ${inactiveYen}\n`;
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
    await YenLog(message);
    if (discordMessage) {
	await discordMessage.channel.send(threeTicks + message + threeTicks);
    }
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
    await discordMessage.channel.bulkDelete(99);
    await discordMessage.channel.send(
	"**What is a yen?**\n" +
	"Yen is the official currency of The Government. Its value is pegged to the actual Japanese Yen (JPY). You can think of them as being worth about 1 American penny each. See how many yen you have with\n" +
	"```!yen```\n");
    await discordMessage.channel.send(
	"**How can I get some yen?**\n" +
	"A few ways. Ask a General what needs doing. They usually have some yen. Trade valuable items in game for yen. Scrap and tea seem to be the most profitable items. Government contracts like wall building pay yen. Place in the top 3 of a PVP Tournament for cash prizes in yen.\n" +
	"You can get fresh yen by depositing valuable Rust skins with Jeff in the Steam Marketplace.\n");
    await discordMessage.channel.send(
	"**How can I spend yen?**\n" +
	"Send yen to other members of The Government with\n" +
	"```!pay @RecipientName amount```\n" +
	"For example:\n" +
	"```!pay @Jeff 42```\n" +
	"You can give someone a quick thumbs-up by sending them one yen\n" +
	"```!tip @Jeff```\n" +
	"**What can I buy with yen?**\n" +
	"Trade items in game, prizes for contests, government contracts from Mr. President, trading Rust skins, tipping/gifting, settling small real-world debts, bribing your way out of Ban Court, role playing shopkeeper with real money, and much more. Can't wait to see what you creative capitalists will come up with.\n");
    await discordMessage.channel.send(
	"**Do yen have real-world cash value?**\n" +
	"Yes. The yen can be freely exchanged for USD at real-world exchange rates, and vice-versa. That makes them pretty much real money.\n");
    await discordMessage.channel.send(
	"**How do I trade my yen for real-world cash?**\n" +
	"Check out Jeff's Steam Inventory at https://steamcommunity.com/profiles/76561198054245955/inventory/\nPick a Rust skin of the monetary value you want to withdraw. Send a one-way trade to Jeff for that item. Use !pay to send the equivalent amount of yen to Jeff. Jeff will accept the trade through Steam and destroy the yen, taking it out of circulation. Withdrawals and deposits are processed at the same rate: the sell price in Steam Marketplace.\n");
    await discordMessage.channel.send(
	"**Where can I find Jeff's inventory?**\n" +
	"Jeff's inventory is at https://steamcommunity.com/profiles/76561198054245955/inventory/\nYou can add Jeff as a friend on Steam using his friend code 93980227");
    await discordMessage.channel.send(
	"**What about the other way around? Can I trade real-world cash for yen?**\n" +
	"Yes. Use your real-world cash to buy a Rust skin. Then deposit it in Jeff's inventory using a one-way trade. Jeff will create the equivalent amount of new yen and send it to you.\n");
    await discordMessage.channel.send(
	"**What backs the yen?**\n" +
	"Yen are backed by real-world assets: Rust skins in the Steam Marketplace. Skins are in turn freely convertible to real cash: USD and JPY. yen are freely exchangeable for skins in both directions at the same price: the sell price in Steam Marketplace. The reserve ratio will always stay comfortably above 100% so that each yen is fully backed. The extra coverage above 100% means that users of the yen can always count on trading every last yen for high-priced, desirable Steam skins. Confidence in the yen will never be shaken. The yen is real money.\n");
    await discordMessage.channel.send(
	"**What if there is a bank run?**\n" +
	"Every last yen in circulation is backed by more than its value in liquid assets. This means that in the case of a bank run, the last person to withdraw their yen will still be left with a large selection of Rust skins to choose from at a variety of price points. There will be no issue with the last person being left with scraps to choose from. We can have confidence that every last yen in circulation is fully backed, and then some.\n");
    await discordMessage.channel.send(
	"**Is there a limit to how many yen can be in circulation?**\n" +
	"Total yen in circulation will never be allowed to exceed ¥150,000, or about $1000 USD. This is to keep it fun and prevent us from getting sued.\n");
    await discordMessage.channel.send(
	"**Are there any fees?**\n" +
	"No. yen can be exchanged for Rust skins at the same price as they were deposited: the sell price in Steam Marketplace. There is no fee for withdrawing or depositing yen, or sending yen between members.\n");
    await discordMessage.channel.send(
	"**Is there any tax?**\n" +
	"Active members are never taxed. It's easy to dodge the tax by connecting to voice chat once every 3 months. Members inactive from voice chat for longer than 90 days start getting their yen taxed at 20% per month. The tax is a gentle way to put inactive yen back into circulation. Another way to dodge the tax is to spend all your yen or cash them out for Steam skins before going inactive.\n");
    await discordMessage.channel.send(
	"**What is the long-term plan for guaranteeing the stability of the yen?**\n" +
	"The reserve ratio will be kept comfortably above 100% at all times. Every yen in circulation is backed with room to spare. It will never be allowed to create new yen out of nowhere, without depositing valueable, highly liquid Rust skins. Yen withdrawn from the system will be permanently destroyed, as they are no longer backed by assets. This plan will keep the Government yen pegged to exactly the value of real Japanese Yen (JPY).\n");
    await discordMessage.channel.send(
	"**Where did the first yen come from?**\n" +
	"Jeff created the very first yen by staking some of his own Rust skins. More than a dozen other members have now created yen by staking their own Rust skins. The yen now circulates widely to over 100 users.\n");
    await discordMessage.channel.send(
	"**What is the plan for keeping the yen in wide circulation?**\n" +
	"#tax guarantees that the yen remain in circulation long-term. Active members are never taxed. Trading yen between members in exchange for scrap, tea, and other in-game items will be encouraged. Cash bounties will be encouraged. Tipping (sending someone 1 yen) will be encouraged as a way to add oomph to reactions in Discord. Members have found even more innovative ways to use yen.\n");
    await discordMessage.channel.send(
	"**If anyone can create new yen by depositing Rust skins, doesn't that debase the existing yen causing inflation?**\n" +
	"No. Each and every single yen in circulation is fully backed. Like the gold standard. It is a stablecoin, pegged to the value of actual Japanese Yen (JPY).\n");
    await discordMessage.channel.send(
	"**Does Government spending of yen cause inflation?**\n" +
	"No. The yen that Mr. President spends on behalf of The Government come from taxing inactive members at a gentle rate. The Government does not spend newly printed yen. The primary function of Government spending is to put inactive yen back into circulation.\n");
    await discordMessage.channel.send(
	"**Is yen a cryptocurrency?**\n" +
	"No. Government yen are a traditional, centrally issued fiat currency. The're boring. The balances are stored in a central database. With backups of course!\n" +
	"The value of the yen is pegged to the value of the actual Japanese Yen (JPY). They are similar in value to an American penny (1 cent).\n");
    await discordMessage.channel.send(
	"**Is this even legal?**\n" +
	"No. Definitely not. But...\n" +
	"The amount of yen in circulation is capped to a few hundred US dollars worth. Legally speaking, it is like a game of penny poker.\n" +
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
    DoLottery,
    HandleConvertCommand,
    HandlePayCommand,
    HandleTaxCommand,
    HandleTipCommand,
    HandleYenCommand,
    HandleYenCreateCommand,
    HandleYenDestroyCommand,
    HandleYenFaqCommand,
};
