const assert = require('assert');
const RenderChainOfCommand = require('./render-chain-of-command');
const sampleChainOfCommand = require('./sample-chain-of-command');

describe('Render Chain of Command', function() {
    it('Render the chain of command as an image', () => {
	// TODO: find a way to run this test as a separate integration test or something.
	// It takes too long to run, blowing up the CI environment.
	//const nicknames = {
	//    6: 'Brobob',
	//    7: 'Jeff',
	//    32: 'Ssulfur',
	//    38: 'watergate',
	//    42: 'Cheatx',
	//    77: 'Zomboscott',
	//};
	//const canvas = RenderChainOfCommand(sampleChainOfCommand, nicknames);
	//const buf = canvas.toBuffer();
	//fs.writeFileSync('sample-chain-of-command-tmp.png', buf);
	// Compare the image data to the expected output file.
	//const expected = fs.readFileSync('sample-chain-of-command.png');
	//assert(buf.equals(expected));
    });
});
