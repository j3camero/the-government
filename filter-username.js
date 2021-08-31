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
	'𝘉': 'B',
	'𝘶': 'u',
	'𝘯': 'n',
	'𝘪': 'i',
	'𝘊': 'C',
	'𝘩': 'h',
	'𝘢': 'a',
	'𝘰': 'o',
	'𝘴': 's',
	'♡': 'x',
	'𝙋': 'P',
	'𝘼': 'A',
	'𝙄': 'I',
	'乃': 'B',
	'ㄥ': 'L',
	'ㄩ': 'U',
	'尺': 'R',
	'î': 'i',
	'ł': 'l',
	'ø': 'o',
    };
    for (const [before, after] of Object.entries(substitutions)) {
	username = username.split(before).join(after);
    }
    let s = '';
    for (let i = 0; i < username.length; i++) {
	const c = username.charAt(i);
	if (allowedChars.indexOf(c) >= 0) {
	    s += c;
	}
    }
    const maxNameLength = 18;
    s = s.trim().slice(0, maxNameLength).trim();
    if (s.length === 0) {
	s = 'John Doe';
    }
    return s;
}

module.exports = FilterUsername;
