export function randomIntBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomItem(array) {
    return array[randomIntBetween(0, array.length - 1)];
}

export function randomDistinctPair(array) {
    const first = randomItem(array);
    let second = randomItem(array);
    while (second === first && array.length > 1) {
        second = randomItem(array);
    }
    return [first, second];
}

export function generateIdempotencyKey(prefix = 'perf') {
    return `${prefix}-${Date.now()}-${randomIntBetween(0, 1_000_000)}-${__VU}-${__ITER}`;
}
