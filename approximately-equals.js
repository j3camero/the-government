// Used for unit testing.

function ApproximatelyEquals(x, y, tolerance=0.01) {
    const diff = Math.abs(x - y);
    return diff < tolerance;
}

module.exports = ApproximatelyEquals;
