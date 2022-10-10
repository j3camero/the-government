// Load some data about PIN use frequency.
const pinFrequencyDict = require('./pin-frequency');

// Sort the pins by frequency.
const pins = [];
for (const [pin, frequency] of Object.entries(pinFrequencyDict)) {
    pins.push({ pin, frequency });
}
pins.sort((a, b) => b.frequency - a.frequency);
// Keep only the non-obvious pins. That is, exclude the 1000 most-used pins
// and the 1000 least-used pins, keeping only the middle 8000.
const nonObviousPins = pins.slice(1000, 9000);

// Generates a random non-obvious 4-digit pin code. Non-obvious means that it
// never selects any of the 1000 most-used pins or the 1000 least-used pins.
// That is, it selects randomly from the 8000 middle pin codes. This is done
// to frustrate dictionary attacks against the pin codes.
function GenerateRandomNonObviousPin() {
    const n = nonObviousPins.length;
    const randomIndex = Math.floor(Math.random() * n);
    return nonObviousPins[randomIndex].pin;
}

module.exports = GenerateRandomNonObviousPin;
