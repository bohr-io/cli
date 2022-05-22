module.exports = async (m) => {
    const x = await import(m);
    return x.default;
};