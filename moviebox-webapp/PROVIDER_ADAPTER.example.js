// Map your real provider output into the relay contract.
// Do this on the server. Never publish signed cookies or Authorization
// credentials in frontend JavaScript.

async function getStreamCandidates(movie) {
  // Replace this function with your real upstream/provider integration.
  // Return all playable mirrors, from highest quality to lowest if possible.
  // Example:
  // return [{
  //   url: 'https://cdn.example/video.mp4',
  //   quality: '1080p',
  //   headers: {
  //     'user-agent': 'provider-required-UA',
  //     'referer': 'https://provider.example/',
  //     'cookie': 'session=...',
  //     'authorization': 'Bearer ...'
  //   }
  // }];
  return [];
}

module.exports = { getStreamCandidates };
