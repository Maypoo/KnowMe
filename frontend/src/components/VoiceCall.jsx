import { forwardRef, useImperativeHandle, useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { socket } from '../lib/socket'
import { api } from '../lib/api'
import { createPeerConnection } from '../lib/webrtc'
import { spring } from '../lib/motion'
import Avatar from './Avatar'

const VoiceCall = forwardRef((props, ref) => {
  const [callState, setCallState] = useState('idle')
  const [otherUser, setOtherUser] = useState(null)
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(0)
  const [finalDuration, setFinalDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [remoteMuted, setRemoteMuted] = useState(false)

  const callStateRef = useRef('idle')
  const otherUserRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
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
    setRemoteMuted(false)
    setIsMuted(false)
  }, [])

  const resetState = useCallback(() => {
    callStateRef.current = 'idle'
    otherUserRef.current = null
    setCallState('idle')
    setOtherUser(null)
    setError('')
    setFinalDuration(0)
    pendingCandidatesRef.current = []
  }, [])

  const showError = useCallback((msg) => {
    setError(msg)
    cleanup()
    setTimeout(resetState, 2000)
  }, [cleanup, resetState])

  const toggleMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks()
    if (audioTracks && audioTracks.length > 0) {
      const nextEnabled = !audioTracks[0].enabled
      audioTracks.forEach(track => { track.enabled = nextEnabled })
      setIsMuted(!nextEnabled)
      if (otherUserRef.current) {
        socket.emit('call:mute', { targetUserId: otherUserRef.current.id, muted: !nextEnabled })
      }
    }
  }, [])

  const endCall = useCallback(() => {
    stopTimer()
    if (otherUserRef.current) {
      api('/api/calls/end', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: otherUserRef.current.id }),
      }).catch(() => {})
    }
    cleanup()
    resetState()
  }, [cleanup, stopTimer, resetState])

  const startCall = useCallback(async (user) => {
    if (callStateRef.current !== 'idle') return

    callStateRef.current = 'waiting'
    otherUserRef.current = user
    setOtherUser(user)
    setCallState('waiting')
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (callStateRef.current === 'idle') { cleanup(); return }
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
        syncRemoteAudio()
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          if (callStateRef.current !== 'idle') {
            endCall()
          }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          callStateRef.current = 'connected'
          setCallState('connected')
          if (!callStartTimeRef.current) startTimer()
        }
      }

      if (callStateRef.current === 'idle') { cleanup(); return }
      const offer = await pc.createOffer()
      if (callStateRef.current === 'idle') { cleanup(); return }
      await pc.setLocalDescription(offer)
      if (callStateRef.current === 'idle') { cleanup(); return }

      const offerRes = await api('/api/calls/offer', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: user.id, sdp: offer }),
      })
      if (callStateRef.current === 'idle') { cleanup(); return }
      if (offerRes.status === 409) {
        const data = await offerRes.json().catch(() => ({}))
        showError(data.message || 'Ya estás en una llamada')
        return
      }
      if (!offerRes.ok) throw new Error('Error al enviar la oferta')
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        showError('Permiso de micrófono denegado')
      } else {
        showError('Error al iniciar la llamada')
      }
    }
  }, [endCall, cleanup, startTimer, showError, syncRemoteAudio])

  const joinCall = useCallback(async (callerUser, offerSdp) => {
    if (callStateRef.current !== 'idle') return

    callStateRef.current = 'joining'
    otherUserRef.current = callerUser
    setOtherUser(callerUser)
    setCallState('joining')
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (callStateRef.current === 'idle') { cleanup(); return }
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
        syncRemoteAudio()
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          if (callStateRef.current !== 'idle') {
            endCall()
          }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          callStateRef.current = 'connected'
          setCallState('connected')
          if (!callStartTimeRef.current) startTimer()
        }
      }

      if (callStateRef.current === 'idle') { cleanup(); return }
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      if (callStateRef.current === 'idle') { cleanup(); return }
      const answer = await pc.createAnswer()
      if (callStateRef.current === 'idle') { cleanup(); return }
      await pc.setLocalDescription(answer)
      if (callStateRef.current === 'idle') { cleanup(); return }

      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch (err) { console.error(err) }
      }
      pendingCandidatesRef.current = []

      const answerRes = await api('/api/calls/answer', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: callerUser.id, sdp: answer }),
      })
      if (callStateRef.current === 'idle') { cleanup(); return }
      if (answerRes.status === 404) {
        showError('La llamada ya no está disponible')
        return
      }
      if (!answerRes.ok) throw new Error('Error al aceptar la llamada')

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (!callStartTimeRef.current) startTimer()
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        showError('Permiso de micrófono denegado')
      } else {
        showError('Error al unirse a la llamada')
      }
    }
  }, [endCall, cleanup, startTimer, showError, syncRemoteAudio])

  useImperativeHandle(ref, () => ({ startCall, joinCall }), [startCall, joinCall])

  useEffect(() => {
    syncRemoteAudio()
  })

  useEffect(() => {
    const handleAnswer = async (data) => {
      if (pcRef.current && data.sdp && callStateRef.current === 'waiting') {
        if (pcRef.current.signalingState !== 'have-local-offer') return
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp))
          for (const c of pendingCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)) } catch (err) { console.error(err) }
          }
          pendingCandidatesRef.current = []
          if (pcRef.current.iceConnectionState === 'connected' || pcRef.current.iceConnectionState === 'completed') {
            callStateRef.current = 'connected'
            setCallState('connected')
            if (!callStartTimeRef.current) startTimer()
          }
        } catch (err) {
          console.error(err)
          endCall()
        }
      }
    }

    const handleIceCandidate = async (data) => {
      if (!data.candidate) return
      if (pcRef.current?.currentRemoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (err) { console.error(err) }
      } else {
        pendingCandidatesRef.current.push(data.candidate)
      }
    }

    const handleEnd = () => {
      if (callStateRef.current === 'idle') return
      stopTimer()
      cleanup()
      resetState()
    }

    const handleRemoteMute = (data) => {
      setRemoteMuted(data.muted)
    }

    socket.on('signal:answer', handleAnswer)
    socket.on('signal:ice-candidate', handleIceCandidate)
    socket.on('call:end', handleEnd)
    socket.on('call:mute', handleRemoteMute)

    return () => {
      socket.off('signal:answer', handleAnswer)
      socket.off('signal:ice-candidate', handleIceCandidate)
      socket.off('call:end', handleEnd)
      socket.off('call:mute', handleRemoteMute)
      cleanup()
    }
  }, [cleanup, endCall, resetState, stopTimer])

  if (callState === 'idle') return null

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70 backdrop-blur-[8px]" />
          <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={spring.default} className="relative bg-zinc-900/90 backdrop-blur-[20px] border border-white/[0.08] rounded-[1.5rem] p-8 w-80 flex flex-col items-center gap-4 shadow-[0_24px_64px_rgba(0,0,0,0.5)] will-change-transform" style={{ transformOrigin: 'center center' }}>
          <Avatar src={otherUser?.avatar_url} size={80} />

          <p className="text-zinc-100 text-lg font-medium">{otherUser?.username}</p>

          {remoteMuted && callState === 'connected' && (
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs -mt-3">
              <MicOff size={14} />
              <span>Silenciado</span>
            </div>
          )}

          {error && callState !== 'ended' && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {callState === 'waiting' && (
            <>
              <p className="text-zinc-400 text-sm tracking-[-0.011em] text-center">Esperando que {(otherUser?.username || '').replace(/^@/, '').split(' ')[0] || 'el usuario'} se una...</p>
              <div className="flex items-center gap-4">
                <motion.button whileTap={{ scale: 0.93 }} onClick={toggleMute} className={`rounded-full p-4 shadow-sm tap-highlight transition-colors ${isMuted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'}`}>{isMuted ? <MicOff size={22} /> : <Mic size={22} />}</motion.button>
                <motion.button whileTap={{ scale: 0.93 }} onClick={endCall} className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 shadow-sm tap-highlight transition-colors"><PhoneOff size={22} /></motion.button>
              </div>
            </>
          )}

          {callState === 'joining' && (
            <>
              <p className="text-zinc-400 text-sm tracking-[-0.011em]">Conectando...</p>
              <motion.button whileTap={{ scale: 0.93 }} onClick={endCall} className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 shadow-sm tap-highlight transition-colors"><PhoneOff size={22} /></motion.button>
            </>
          )}

          {callState === 'connected' && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <p className="text-green-400 text-sm font-medium tracking-[-0.011em]">En llamada</p>
              </div>
              <p className="text-zinc-200 text-lg font-mono tabular-nums tracking-tight">{formatDuration(duration)}</p>
              <div className="flex items-center gap-4">
                <motion.button whileTap={{ scale: 0.93 }} onClick={toggleMute} className={`rounded-full p-4 shadow-sm tap-highlight transition-colors ${isMuted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'}`}>{isMuted ? <MicOff size={22} /> : <Mic size={22} />}</motion.button>
                <motion.button whileTap={{ scale: 0.93 }} onClick={endCall} className="rounded-full p-4 bg-red-600 text-white hover:bg-red-700 shadow-sm tap-highlight transition-colors"><PhoneOff size={22} /></motion.button>
              </div>
            </>
          )}

          {callState === 'ended' && null}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  )
})

export default VoiceCall
