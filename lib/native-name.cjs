'use strict';
// Which prebuilt addon file matches this platform, e.g. "darwin-arm64" or "linux-x64-musl".
module.exports = function nativeName() {
  const { platform, arch } = process;
  if (platform === 'linux') {
    const glibc = process.report?.getReport?.().header?.glibcVersionRuntime;
    return `linux-${arch}-${glibc ? 'gnu' : 'musl'}`;
  }
  if (platform === 'win32') return `win32-${arch}-msvc`;
  return `${platform}-${arch}`;
};
