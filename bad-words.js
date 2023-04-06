// List of bad words that Discord doesn't like for chatroom names due to
// Discord Discovery policy.

const badWords = [
    'bitch',
    'fag',
    'faggot',
    'nigger',
    'whore',
];

function ContainsBadWords(s) {
    const lower = s.toLowerCase();
    for (const word of badWords) {
	if (lower.includes(word)) {
	    return true;
	}
    }
    return false;
}

module.exports = {
    ContainsBadWords,
};
