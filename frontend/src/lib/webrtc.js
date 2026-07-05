export function createPeerConnection(config = {}) {
  try {
    return new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
      ...config,
    })
  } catch {
    return null
  }
}
