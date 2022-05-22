module.exports.default = async () => {
    let gitRemoteOriginUrl = await import('git-remote-origin-url');
    return await gitRemoteOriginUrl.default();
};