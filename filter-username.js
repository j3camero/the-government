// Filters Discord usernames to replace or remove problematic characters.
function FilterUsername(username) {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_` ()!?\'*+/\\:=~èáéíóúüñà';
    const substitutions = {
	'ғ': 'f',
	'ｕ': 'U',
	'ᶜ': 'c',
	'Ќ': 'K',
	'ץ': 'Y',
	'๏': 'o',
	'Ữ': 'u',
	'Ｍ': 'M',
	'Ａ': 'A',
	'ŕ': 'r',
	'Ｋ': 'K',
    };
    let s = '';
    for (let i = 0; i < username.length; i++) {
	const c = username.charAt(i);
	if (allowedChars.indexOf(c) >= 0) {
	    s += c;
	} else if (c in substitutions) {
	    s += substitutions[c];
	}
    }
    const maxNameLength = 18;
    s = s.trim().slice(0, maxNameLength).trim();
    if (s.length === 0) {
	s = '???';
    }
    return s;
}

module.exports = FilterUsername;
