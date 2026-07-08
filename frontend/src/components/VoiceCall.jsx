import { forwardRef, useImperativeHandle, useEffect, useState, useRef, useCallback } from 'react'
import { socket } from '../lib/socket'
import { api } from '../lib/api'
import { createPeerConnection } from '../lib/webrtc'
import Avatar from './Avatar'

const VoiceCall = forwardRef(({ profile }, ref) => {
  const [callState, setCallState] = useState('idle')
  const [otherUser, setOtherUser] = useState(null)
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(0)
  const [finalDuration, setFinalDuration] = useState(0)

  const callStateRef = useRef('idle')
  const otherUserRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const incomingOfferRef = useRef(null)
  const timeoutRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const timerIntervalRef = useRef(null)
  const callStartTimeRef = useRef(null)

  const formatDuration = useCallback((sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  const startTimer = useCallback(() => {
    callStartTimeRef.current = Date.now()
    setDuration(0)
    clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000))
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
    if (callStartTimeRef.current) {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000)
      setFinalDuration(elapsed)
    }
    callStartTimeRef.current = null
  }, [])

  const syncRemoteAudio = useCallback(() => {
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current
      remoteAudioRef.current.play().catch(() => {})
    }
  }, [])

  const cleanup = useCallback(() => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
    callStartTimeRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    pendingCandidatesRef.current = []
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
  }, [])

  const showError = useCallback((msg) => {
    cleanup()
    setError(msg)
    callStateRef.current = 'ended'
    setCallState('ended')
    setTimeout(() => {
      callStateRef.current = 'idle'
      otherUserRef.current = null
      incomingOfferRef.current = null
      setCallState('idle')
      setOtherUser(null)
      setError('')
    }, 2000)
  }, [cleanup])

  const endCall = useCallback(() => {
    stopTimer()
    if (otherUserRef.current) {
      api('/api/calls/end', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current.id }),
      }).catch(() => {})
    }
    cleanup()
    callStateRef.current = 'ended'
    setCallState('ended')
    setTimeout(() => {
      callStateRef.current = 'idle'
      otherUserRef.current = null
      incomingOfferRef.current = null
      setCallState('idle')
      setOtherUser(null)
      setError('')
    }, 1500)
  }, [cleanup, stopTimer])

  const startCall = useCallback(async (user) => {
    if (callStateRef.current !== 'idle') return

    callStateRef.current = 'calling'
    otherUserRef.current = user
    setOtherUser(user)
    setCallState('calling')
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPeerConnection()
      pcRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.onicecandidate = (e) => {
        if (e.candidate && otherUserRef.current) {
          socket.emit('signal:ice-candidate', { targetUserId: otherUserRef.current.id, candidate: e.candidate })
        }
      }

      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0]
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0]
          remoteAudioRef.current.play().catch(() => {})
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          if (callStateRef.current !== 'idle') {
            endCall()
          }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearTimeout(timeoutRef.current)
          callStateRef.current = 'connected'
          setCallState('connected')
          startTimer()
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const offerRes = await api('/api/calls/offer', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: user.id, sdp: offer }),
      })
      if (offerRes.status === 409 || offerRes.status === 404) {
        const data = await offerRes.json().catch(() => ({}))
        showError(data.message || 'El usuario no está disponible')
        return
      }
      if (!offerRes.ok) throw new Error('Error al enviar la oferta')

      timeoutRef.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          api('/api/calls/missed', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: otherUserRef.current?.id }),
          }).catch(() => {})
          showError('No se pudo conectar la llamada')
        }
      }, 30000)
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        showError('Permiso de micrófono denegado')
      } else {
        showError('Error al iniciar la llamada')
      }
    }
  }, [endCall, cleanup, startTimer, showError])

  useImperativeHandle(ref, () => ({ startCall }), [startCall])

  useEffect(() => {
    syncRemoteAudio()
  })

  useEffect(() => {
    const handleOffer = (data) => {
      if (callStateRef.current !== 'idle') {
        socket.emit('call:busy', { targetUserId: data.caller.id })
        return
      }

      callStateRef.current = 'ringing'
      otherUserRef.current = data.caller
      incomingOfferRef.current = data.sdp
      setOtherUser(data.caller)
      setCallState('ringing')
      setError('')
    }

    const handleAnswer = async (data) => {
      if (pcRef.current && data.sdp) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp))
          for (const c of pendingCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)) } catch {}
          }
          pendingCandidatesRef.current = []
          if (pcRef.current.iceConnectionState === 'connected' || pcRef.current.iceConnectionState === 'completed') {
            callStateRef.current = 'connected'
            setCallState('connected')
            if (!callStartTimeRef.current) startTimer()
          }
        } catch {
          endCall()
        }
      }
    }

    const handleIceCandidate = async (data) => {
      if (pcRef.current && data.candidate) {
        if (pcRef.current.currentRemoteDescription) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch {}
        } else {
          pendingCandidatesRef.current.push(data.candidate)
        }
      }
    }

    const handleEnd = () => {
      stopTimer()
      cleanup()
      callStateRef.current = 'ended'
      setCallState('ended')
      setTimeout(() => {
        callStateRef.current = 'idle'
        otherUserRef.current = null
        incomingOfferRef.current = null
        setCallState('idle')
        setOtherUser(null)
        setError('')
      }, 1500)
    }

    const handleBusy = () => {
      api('/api/calls/missed', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current?.id }),
      }).catch(() => {})
      showError('El usuario está ocupado')
    }

    const handleUnreachable = () => {
      api('/api/calls/missed', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current?.id }),
      }).catch(() => {})
      showError('El usuario no está disponible')
    }

    const handleAck = () => {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          api('/api/calls/missed', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: otherUserRef.current?.id }),
          }).catch(() => {})
          showError('El usuario no respondió')
        }
      }, 60000)
    }

    const handleDebug = (data) => {
      if (data?.error === 'missing_params') {
        showError('Error al enviar la oferta (params)')
      }
    }

    socket.on('signal:offer', handleOffer)
    socket.on('signal:answer', handleAnswer)
    socket.on('signal:ice-candidate', handleIceCandidate)
    socket.on('call:end', handleEnd)
    socket.on('call:busy', handleBusy)
    socket.on('call:unreachable', handleUnreachable)
    socket.on('call:ack', handleAck)
    socket.on('call:debug', handleDebug)

    return () => {
      socket.off('signal:offer', handleOffer)
      socket.off('signal:answer', handleAnswer)
      socket.off('signal:ice-candidate', handleIceCandidate)
      socket.off('call:end', handleEnd)
      socket.off('call:busy', handleBusy)
      socket.off('call:unreachable', handleUnreachable)
      socket.off('call:ack', handleAck)
      socket.off('call:debug', handleDebug)
      cleanup()
    }
    }, [cleanup, endCall, syncRemoteAudio, showError])

  const handleAcceptCall = async () => {
    if (!otherUserRef.current || !incomingOfferRef.current) return

    callStateRef.current = 'calling'
    setCallState('calling')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPeerConnection()
      pcRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.onicecandidate = (e) => {
        if (e.candidate && otherUserRef.current) {
          socket.emit('signal:ice-candidate', { targetUserId: otherUserRef.current.id, candidate: e.candidate })
        }
      }

      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0]
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0]
          remoteAudioRef.current.play().catch(() => {})
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          if (callStateRef.current !== 'idle') {
            endCall()
          }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearTimeout(timeoutRef.current)
          callStateRef.current = 'connected'
          setCallState('connected')
          if (!callStartTimeRef.current) startTimer()
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
      }
      pendingCandidatesRef.current = []

      await api('/api/calls/answer', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current.id, sdp: answer }),
      })

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (!callStartTimeRef.current) startTimer()
      } else {
        timeoutRef.current = setTimeout(() => {
          if (callStateRef.current !== 'idle') {
            endCall()
          }
        }, 15000)
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Permiso de micrófono denegado')
      } else {
        setError('Error al aceptar la llamada')
      }
      endCall()
    }
  }

  const handleRejectCall = () => {
    if (otherUserRef.current) {
      api('/api/calls/end', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current.id }),
      }).catch(() => {})
    }
    cleanup()
    callStateRef.current = 'idle'
    otherUserRef.current = null
    incomingOfferRef.current = null
    setCallState('idle')
    setOtherUser(null)
    setError('')
  }

  if (callState === 'idle') return null

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-zinc-900 rounded-2xl p-8 w-80 flex flex-col items-center gap-6 shadow-2xl">
          <Avatar src={otherUser?.avatar_url} size={80} />

          <p className="text-zinc-100 text-lg font-medium">{otherUser?.username}</p>

          {error && callState !== 'ended' && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {callState === 'calling' && (
            <>
              <p className="text-zinc-400 text-sm">Llamando...</p>
              <button
                onClick={endCall}
                className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 transition"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
            </>
          )}

          {callState === 'ringing' && (
            <>
              <p className="text-zinc-400 text-sm animate-pulse">Llamada entrante...</p>
              <div className="flex items-center gap-6">
                <button
                  onClick={handleAcceptCall}
                  className="rounded-full p-4 bg-green-600 text-white hover:bg-green-700 transition"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
                <button
                  onClick={handleRejectCall}
                  className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 transition"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </>
          )}

          {callState === 'connected' && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <p className="text-green-400 text-sm font-medium">En llamada</p>
              </div>
              <p className="text-zinc-300 text-lg font-mono tabular-nums">{formatDuration(duration)}</p>
              <button
                onClick={endCall}
                className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 transition"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
            </>
          )}

          {callState === 'ended' && (
            <div className="flex flex-col items-center gap-1">
              {error ? (
                <p className="text-red-400 text-sm text-center">{error}</p>
              ) : (
                <>
                  <p className="text-zinc-400 text-sm">Llamada finalizada</p>
                  {finalDuration > 0 && (
                    <p className="text-zinc-500 text-xs font-mono tabular-nums">Duración: {formatDuration(finalDuration)}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
})

export default VoiceCall
