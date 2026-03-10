import { useState, useEffect, useRef, useCallback } from 'react'
import Peer from 'peerjs'
import {
  Search,
  MoreVertical,
  Phone,
  Video,
  Send,
  Mic,
  Paperclip,
  Check,
  CheckCheck,
  // X,
  // Menu,
  ArrowLeft,
  Copy,
  PhoneOff,
  MicOff,
  VideoOff,
  Bell,
  BellOff,
  Trash2,
  Volume2,
  VolumeX
} from 'lucide-react'

// Types
interface Message {
  id: string
  text: string
  senderId: string
  timestamp: number
  status: 'sending' | 'sent' | 'delivered' | 'read'
}

interface Conversation {
  peerId: string
  messages: Message[]
  lastMessage?: Message
  unreadCount: number
}

interface AppState {
  myId: string | null
  connectedPeerId: string | null
  isConnected: boolean
  conversations: Record<string, Conversation>
  activeConversation: string | null
  isVideoCallActive: boolean
  isIncomingCall: boolean
  incomingCallFrom: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isVideoOff: boolean
  isMobileView: boolean
  showSidebar: boolean
  notificationsEnabled: boolean
  notificationPermission: NotificationPermission | 'unsupported'
  soundEnabled: boolean
  showDeleteMenu: string | null
}

// LocalStorage helpers
const getStoredConversations = (): Record<string, Conversation> => {
  const stored = localStorage.getItem('whatsapp_conversations')
  return stored ? JSON.parse(stored) : {}
}

const saveConversations = (conversations: Record<string, Conversation>) => {
  localStorage.setItem('whatsapp_conversations', JSON.stringify(conversations))
}

const getMyId = (): string | null => {
  return localStorage.getItem('whatsapp_my_id')
}

const saveMyId = (id: string) => {
  localStorage.setItem('whatsapp_my_id', id)
}

const getNotificationSettings = (): { enabled: boolean } => {
  const stored = localStorage.getItem('whatsapp_notifications')
  return stored ? JSON.parse(stored) : { enabled: true }
}

const saveNotificationSettings = (enabled: boolean) => {
  localStorage.setItem('whatsapp_notifications', JSON.stringify({ enabled }))
}

const getSoundSettings = (): { enabled: boolean } => {
  const stored = localStorage.getItem('whatsapp_sounds')
  return stored ? JSON.parse(stored) : { enabled: true }
}

const saveSoundSettings = (enabled: boolean) => {
  localStorage.setItem('whatsapp_sounds', JSON.stringify({ enabled }))
}

// Generate random ID
const generateId = () => {
  return 'wa-' + Math.random().toString(36).substr(2, 9)
}

function App() {
  const [state, setState] = useState<AppState>(() => {
    const notifSettings = getNotificationSettings()
    const soundSettings = getSoundSettings()
    return {
      myId: null,
      connectedPeerId: null,
      isConnected: false,
      conversations: {},
      activeConversation: null,
      isVideoCallActive: false,
      isIncomingCall: false,
      incomingCallFrom: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
      isMobileView: window.innerWidth < 768,
      showSidebar: true,
      notificationsEnabled: notifSettings.enabled,
      notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      soundEnabled: soundSettings.enabled,
      showDeleteMenu: null
    }
  })

  const [messageInput, setMessageInput] = useState('')
  const [peerIdInput, setPeerIdInput] = useState('')
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const peerRef = useRef<Peer | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentCallRef = useRef<any>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)
  const ringbackRef = useRef<HTMLAudioElement | null>(null)

  // Initialize PeerJS
  useEffect(() => {
    const initPeer = () => {
      const storedMyId = getMyId()
      const myId = storedMyId || generateId()
      if (!storedMyId) saveMyId(myId)

      const peer = new Peer(myId, {
        debug: 1
      })

      peer.on('open', (id) => {
        console.log('My peer ID is:', id)
        setState(prev => ({ ...prev, myId: id }))

        // Check if we're connecting to someone via URL
        const urlParams = new URLSearchParams(window.location.search)
        const connectTo = urlParams.get('connect')
        if (connectTo) {
          setPeerIdInput(connectTo)
          connectToPeer(connectTo, peer)
        }
      })

      peer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer)
        setupConnection(conn.peer, conn)
      })

      peer.on('call', (call) => {
        console.log('Incoming call from:', call.peer)

        // Show incoming call modal
        setState(prev => ({
          ...prev,
          isIncomingCall: true,
          incomingCallFrom: call.peer
        }))

        // Play ringtone
        setTimeout(() => playRingtone(), 100)

        // Store call reference
        currentCallRef.current = call
      })

      peer.on('error', (err) => {
        console.error('Peer error:', err)
        localStorage.removeItem('whatsapp_my_id')
        // // Handle specific errors (e.g., ID already taken)
        // if (err.type === 'unavailable-id') {
        //   setState(prev => ({ ...prev, myId: null }))
        // }
      })

      peerRef.current = peer
    }

    // Load existing conversations
    const storedConversations = getStoredConversations()
    setState(prev => ({ ...prev, conversations: storedConversations }))

    initPeer()

    // Handle resize
    const handleResize = () => {
      setState(prev => ({
        ...prev,
        isMobileView: window.innerWidth < 768
      }))
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (peerRef.current) {
        peerRef.current.destroy()
      }
    }
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.conversations, state.activeConversation])

  // Connect to peer
  const connectToPeer = (peerId: string, peer?: Peer) => {
    const p = peer || peerRef.current
    if (!p || !peerId) return

    console.log('Connecting to:', peerId)
    const conn = p.connect(peerId, {
      reliable: true
    })

    setupConnection(peerId, conn)
  }

  // Setup connection handlers
  const setupConnection = (peerId: string, conn: any) => {
    conn.on('open', () => {
      console.log('Connected to:', peerId)
      setState(prev => ({
        ...prev,
        connectedPeerId: peerId,
        isConnected: true,
        activeConversation: peerId,
        showSidebar: !prev.isMobileView
      }))
    })

    conn.on('data', (data: any) => {
      console.log('Received:', data)

      if (data.type === 'message') {
        const newMessage: Message = {
          id: generateId(),
          text: data.text,
          senderId: data.senderId,
          timestamp: data.timestamp,
          status: 'delivered'
        }

        setState(prev => {
          const conv = prev.conversations[peerId] || {
            peerId,
            messages: [],
            unreadCount: 0
          }

          const updatedConv = {
            ...conv,
            messages: [...conv.messages, newMessage],
            lastMessage: newMessage
          }

          const updatedConversations = {
            ...prev.conversations,
            [peerId]: updatedConv
          }

          saveConversations(updatedConversations)

          return {
            ...prev,
            conversations: updatedConversations
          }
        })

        // Send delivery acknowledgment
        conn.send({
          type: 'ack',
          messageId: newMessage.id,
          senderId: state.myId
        })

        // Show notification for new message (if not in active conversation)
        if (state.activeConversation !== peerId) {
          showNotification(
            `New message from ${peerId}`,
            data.text,
            `msg-${peerId}`
          )
          // Also notify service worker
          sendToServiceWorker(peerId, data.text)
        }
      } else if (data.type === 'ack') {
        // Update message status
        setState(prev => {
          const conv = prev.conversations[peerId]
          if (!conv) return prev

          const updatedMessages = conv.messages.map(msg =>
            msg.id === data.messageId ? { ...msg, status: 'delivered' as const } : msg
          )

          const updatedConversations = {
            ...prev.conversations,
            [peerId]: { ...conv, messages: updatedMessages }
          }

          return { ...prev, conversations: updatedConversations }
        })
      }
    })

    conn.on('close', () => {
      setState(prev => ({
        ...prev,
        isConnected: false
      }))
    })

    conn.on('error', (err: any) => {
      console.error('Connection error:', err)
    })
  }

  // Send message
  const sendMessage = () => {
    if (!messageInput.trim() || !state.connectedPeerId) return

    const conn = (peerRef.current as any)?.connections?.[state.connectedPeerId]
    if (!conn?.[0]) {
      console.error('No connection found')
      return
    }

    const newMessage: Message = {
      id: generateId(),
      text: messageInput.trim(),
      senderId: state.myId || '',
      timestamp: Date.now(),
      status: 'sending'
    }

    // Add to local state
    setState(prev => {
      const conv = prev.conversations[state.connectedPeerId!] || {
        peerId: state.connectedPeerId!,
        messages: [],
        unreadCount: 0
      }

      const updatedConv = {
        ...conv,
        messages: [...conv.messages, newMessage],
        lastMessage: newMessage
      }

      const updatedConversations = {
        ...prev.conversations,
        [state.connectedPeerId!]: updatedConv
      }

      saveConversations(updatedConversations)

      return {
        ...prev,
        conversations: updatedConversations
      }
    })

    // Send via PeerJS
    conn[0].send({
      type: 'message',
      text: newMessage.text,
      senderId: state.myId,
      timestamp: newMessage.timestamp
    })

    // Update status to sent
    setState(prev => {
      const conv = prev.conversations[state.connectedPeerId!]
      if (!conv) return prev

      const updatedMessages = conv.messages.map(msg =>
        msg.id === newMessage.id ? { ...msg, status: 'sent' as const } : msg
      )

      return {
        ...prev,
        conversations: {
          ...prev.conversations,
          [state.connectedPeerId!]: { ...conv, messages: updatedMessages }
        }
      }
    })

    setMessageInput('')
  }

  // Start video call
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

      setState(prev => ({
        ...prev,
        localStream: stream,
        isVideoCallActive: true
      }))

      // Play ringback tone for caller
      playRingback()

      // Make the call
      const call = peerRef.current?.call(state.connectedPeerId!, stream)
      if (call) {
        currentCallRef.current = call

        call.on('stream', (remoteStream) => {
          setState(prev => ({ ...prev, remoteStream }))
        })

        call.on('close', () => {
          endCall()
        })
      }
    } catch (err) {
      console.error('Error starting video call:', err)
      alert('Could not access camera/microphone. Please check permissions.')
    }
  }

  // Answer incoming call
  const answerCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

      setState(prev => ({
        ...prev,
        localStream: stream,
        isIncomingCall: false,
        incomingCallFrom: null,
        isVideoCallActive: true
      }))

      if (currentCallRef.current) {
        currentCallRef.current.answer(stream)

        currentCallRef.current.on('stream', (remoteStream: MediaStream) => {
          setState(prev => ({ ...prev, remoteStream }))
        })

        currentCallRef.current.on('close', () => {
          endCall()
        })
      }
    } catch (err) {
      console.error('Error answering call:', err)
      alert('Could not access camera/microphone. Please check permissions.')
    }
  }

  // Decline call
  const declineCall = () => {
    if (currentCallRef.current) {
      currentCallRef.current.close()
    }
    setState(prev => ({
      ...prev,
      isIncomingCall: false,
      incomingCallFrom: null
    }))
  }

  // End call
  const endCall = () => {
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop())
    }

    if (currentCallRef.current) {
      currentCallRef.current.close()
    }

    setState(prev => ({
      ...prev,
      localStream: null,
      remoteStream: null,
      isVideoCallActive: false,
      isMuted: false,
      isVideoOff: false
    }))
  }

  // Toggle mute
  const toggleMute = () => {
    if (state.localStream) {
      const audioTrack = state.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setState(prev => ({ ...prev, isMuted: !audioTrack.enabled }))
      }
    }
  }

  // Toggle video
  const toggleVideo = () => {
    if (state.localStream) {
      const videoTrack = state.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setState(prev => ({ ...prev, isVideoOff: !videoTrack.enabled }))
      }
    }
  }

  // Copy share link
  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?connect=${state.myId}`
    navigator.clipboard.writeText(url)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Notifications are not supported in this browser')
      return
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      setState(prev => ({ ...prev, notificationPermission: permission }))
    }

    if (Notification.permission === 'granted') {
      setState(prev => ({ ...prev, notificationsEnabled: true }))
      saveNotificationSettings(true)
    }
  }

  // Toggle notifications
  const toggleNotifications = () => {
    if (!state.notificationsEnabled && Notification.permission !== 'granted') {
      requestNotificationPermission()
    } else {
      const newEnabled = !state.notificationsEnabled
      setState(prev => ({ ...prev, notificationsEnabled: newEnabled }))
      saveNotificationSettings(newEnabled)
    }
  }

  // Show local notification
  const showNotification = (title: string, body: string, tag: string) => {
    if (!state.notificationsEnabled) return

    // Check if browser supports notifications
    if (typeof Notification === 'undefined') return

    // Only show if permission is granted
    if (Notification.permission !== 'granted') return

    // Don't show if app is in focus
    if (document.hasFocus()) return

    const notification = new Notification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag,
      vibrate: [200, 100, 200]
    } as NotificationOptions)

    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000)
  }

  // Send message to service worker for background notification
  const sendToServiceWorker = (senderId: string, text: string) => {
    if ('serviceWorker' in navigator && state.notificationsEnabled) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({
          type: 'NEW_MESSAGE',
          senderId,
          text
        })
      })
    }
  }

  // Play ringtone for incoming call
  const playRingtone = () => {
    if (!state.soundEnabled) return

    // Use Web Audio API to generate a ringtone sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 440 // A4 note
      oscillator.type = 'sine'
      gainNode.gain.value = 0.3

      // Create a pulsing effect
      const now = audioContext.currentTime
      gainNode.gain.setValueAtTime(0.3, now)
      gainNode.gain.setValueAtTime(0, now + 0.5)
      gainNode.gain.setValueAtTime(0.3, now + 1)
      gainNode.gain.setValueAtTime(0, now + 1.5)
      gainNode.gain.setValueAtTime(0.3, now + 2)
      gainNode.gain.setValueAtTime(0, now + 2.5)

      oscillator.start(now)
      oscillator.stop(now + 2.5)

      // Repeat for ringing effect
      const interval = setInterval(() => {
        if (!state.isIncomingCall) {
          clearInterval(interval)
          return
        }
        const osc2 = audioContext.createOscillator()
        const gain2 = audioContext.createGain()
        osc2.connect(gain2)
        gain2.connect(audioContext.destination)
        osc2.frequency.value = 440
        osc2.type = 'sine'
        gain2.gain.value = 0.3
        const t = audioContext.currentTime
        gain2.gain.setValueAtTime(0.3, t)
        gain2.gain.setValueAtTime(0, t + 0.5)
        osc2.start(t)
        osc2.stop(t + 0.5)
      }, 2000)
    } catch (e) {
      console.log('Audio not supported')
    }
  }

  // Play ringback tone for caller
  const playRingback = () => {
    if (!state.soundEnabled) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      const playTone = () => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = 440
        oscillator.type = 'sine'
        gainNode.gain.value = 0.2

        const now = audioContext.currentTime
        gainNode.gain.setValueAtTime(0.2, now)
        gainNode.gain.setValueAtTime(0, now + 1)

        oscillator.start(now)
        oscillator.stop(now + 1)
      }

      // Play ringback pattern
      playTone()
      const interval = setInterval(() => {
        if (!state.isVideoCallActive || state.remoteStream) {
          clearInterval(interval)
          return
        }
        playTone()
      }, 2000)
    } catch (e) {
      console.log('Audio not supported')
    }
  }

  // Toggle sound settings
  const toggleSound = () => {
    const newEnabled = !state.soundEnabled
    setState(prev => ({ ...prev, soundEnabled: newEnabled }))
    saveSoundSettings(newEnabled)
  }

  // Delete conversation
  const deleteConversation = (peerId: string) => {
    const updatedConversations = { ...state.conversations }
    delete updatedConversations[peerId]
    saveConversations(updatedConversations)

    setState(prev => ({
      ...prev,
      conversations: updatedConversations,
      activeConversation: prev.activeConversation === peerId ? null : prev.activeConversation,
      connectedPeerId: prev.connectedPeerId === peerId ? null : prev.connectedPeerId,
      isConnected: prev.connectedPeerId === peerId ? false : prev.isConnected,
      showDeleteMenu: null
    }))
  }

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString()
    }
  }

  // Get video streams
  useEffect(() => {
    if (localVideoRef.current && state.localStream) {
      localVideoRef.current.srcObject = state.localStream
    }
  }, [state.localStream])

  useEffect(() => {
    if (remoteVideoRef.current && state.remoteStream) {
      remoteVideoRef.current.srcObject = state.remoteStream
    }
  }, [state.remoteStream])

  // Render video call
  const renderVideoCall = () => {
    if (!state.isVideoCallActive) return null

    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
        {/* Remote Video */}
        <div className="flex-1 relative">
          {state.remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-white text-center">
                <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-4xl text-gray-400">
                    {state.connectedPeerId?.slice(-2).toUpperCase()}
                  </span>
                </div>
                <p className="text-gray-400">Connecting...</p>
              </div>
            </div>
          )}
        </div>

        {/* Local Video (Picture in Picture) */}
        <div className="absolute bottom-24 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
          {state.localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${state.isVideoOff ? 'hidden' : ''}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">No camera</p>
            </div>
          )}
          {state.isVideoOff && (
            <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
              <VideoOff className="text-gray-400 w-8 h-8" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm py-6">
          <div className="flex justify-center items-center gap-6">
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                state.isMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {state.isMuted ? (
                <MicOff className="text-white w-6 h-6" />
              ) : (
                <Mic className="text-white w-6 h-6" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                state.isVideoOff ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {state.isVideoOff ? (
                <VideoOff className="text-white w-6 h-6" />
              ) : (
                <Video className="text-white w-6 h-6" />
              )}
            </button>

            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
            >
              <PhoneOff className="text-white w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render incoming call modal
  const renderIncomingCallModal = () => {
    if (!state.isIncomingCall) return null

    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
          <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-6 flex items-center justify-center">
            <span className="text-4xl text-gray-300">
              {state.incomingCallFrom?.slice(-2).toUpperCase()}
            </span>
          </div>
          <h3 className="text-white text-xl font-semibold mb-2">Incoming Video Call</h3>
          <p className="text-gray-400 mb-6">{state.incomingCallFrom}</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
            >
              <PhoneOff className="text-white w-8 h-8" />
            </button>
            <button
              onClick={answerCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
            >
              <Video className="text-white w-8 h-8" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render connection modal
  const renderConnectionModal = () => {
    if (!showConnectionModal) return null

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Connect with Someone</h2>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={state.myId || 'Generating...'}
                readOnly
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
              />
              <button
                onClick={copyShareLink}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share this ID or link with someone to start chatting
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connect to ID
            </label>
            <input
              type="text"
              value={peerIdInput}
              onChange={(e) => setPeerIdInput(e.target.value)}
              placeholder="Enter their ID (e.g., wa-abc123)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConnectionModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (peerIdInput.trim()) {
                  connectToPeer(peerIdInput.trim())
                  setShowConnectionModal(false)
                }
              }}
              disabled={!peerIdInput.trim()}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Get current conversation messages
  const currentMessages = state.activeConversation
    ? state.conversations[state.activeConversation]?.messages || []
    : []

  // Render chat area
  const renderChatArea = () => {
    if (!state.isConnected) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#efeae2] p-8">
          <div className="text-center max-w-md">
            <div className="w-64 h-64 mx-auto mb-8">
              <svg viewBox="0 0 240 240" className="w-full h-full">
                <path
                  fill="#d1d7db"
                  d="M120 18c-49.9 0-90.6 34.1-97.3 80.5c-.5 3.5.2 7.1 2.1 10.1l18.2 31.5c2.1 3.7 5.4 6.5 9.3 7.9l24.7 8.9c3.9 1.4 8.1.9 11.7-1.4l11.3-7.1c2.6-1.6 5.8-2 8.7-.9l17.2 6.2c7.2 2.6 14.9 2.1 21.7-1.4l30.8-15.4c2.9-1.4 6.3-1.6 9.4-.5l15.6 5.3c9.4 3.2 14.8 13.1 11.6 22.5l-7.5 22c-1.3 3.9-.1 8.2 3.2 11.2l46.2 42c3.3 3 4.3 8 2.5 12.2l-11.5 27c-1.4 3.3-.2 7 2.9 9.3l45.5 33.6c3.1 2.3 4.6 6.2 3.8 9.9l-14.8 51.5c-1.5 5.2 3.8 10 9.6 8.7l120-24.8c5.8-1.2 7.9-8.3 3.7-12.5l-36.2-36.2c-3.1-3.1-3.9-7.9-2.1-11.9l12.1-27c1.6-3.5.4-7.6-3-10.4l-42.5-35.4c-3.3-2.8-8.3-2.5-11.5.6l-24.8 23.7c-2.4 2.3-6.1 2.7-9.1 1l-20.8-11.7c-3.1-1.7-6.8-1.5-9.8.7l-19.5 14.4c-2.5 1.8-5.6 2.3-8.5 1.3L120 147c-24.3-8.3-40.8-32-36.8-57.3.5-3.1 1.6-6.1 3.3-8.8L120 18z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-light text-gray-700 mb-4">WhatsApp Web</h2>
            <p className="text-gray-500 mb-8">
              Send and receive messages without keeping your phone online.<br />
              Use WhatsApp on up to 4 linked devices and 1 phone.
            </p>
            <button
              onClick={() => setShowConnectionModal(true)}
              className="px-8 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 font-medium transition-colors"
            >
              Start Chatting
            </button>
          </div>
        </div>
      )
    }

    // const activeConv = state.conversations[state.activeConversation!]

    return (
      <div className="flex-1 flex flex-col bg-[#efeae2]">
        {/* Chat Header */}
        <div className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-3 border-b border-gray-200">
          <button
            onClick={() => setState(prev => ({ ...prev, showSidebar: true }))}
            className="md:hidden"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>

          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">
            {state.connectedPeerId?.slice(-2).toUpperCase()}
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">{state.connectedPeerId}</h3>
            <p className="text-xs text-gray-500">{state.isConnected ? 'Online' : 'Offline'}</p>
          </div>

          <button
            onClick={startVideoCall}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            title="Video call"
          >
            <Video className="w-5 h-5 text-gray-600" />
          </button>

          {/* <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <Phone className="w-5 h-5 text-gray-600" />
          </button>

          <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button> */}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {currentMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">Send a message to start the conversation</p>
            </div>
          )}

          {currentMessages.map((message, index) => {
            const isOutgoing = message.senderId === state.myId
            const showDate = index === 0 ||
              formatDate(message.timestamp) !== formatDate(currentMessages[index - 1].timestamp)

            return (
              <div key={message.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span className="bg-gray-300/50 text-gray-600 text-xs px-3 py-1 rounded-full">
                      {formatDate(message.timestamp)}
                    </span>
                  </div>
                )}
                <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[70%] px-4 py-2 rounded-lg ${
                      isOutgoing
                        ? 'bg-[#d9fdd3] rounded-tr-none'
                        : 'bg-white rounded-tl-none'
                    } shadow-sm`}
                    style={{ borderRadius: isOutgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px' }}
                  >
                    <p className="text-gray-800 whitespace-pre-wrap break-words">{message.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs text-gray-500">
                        {formatTime(message.timestamp)}
                      </span>
                      {isOutgoing && (
                        <span className="text-xs">
                          {message.status === 'sending' && (
                            <Check className="w-3 h-3 text-gray-400" />
                          )}
                          {message.status === 'sent' && (
                            <Check className="w-3 h-3 text-gray-500" />
                          )}
                          {(message.status === 'delivered' || message.status === 'read') && (
                            <CheckCheck className="w-3 h-3 text-gray-500" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-2">
          <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <Paperclip className="w-5 h-5 text-gray-600" />
          </button>

          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message"
            className="flex-1 px-4 py-2 bg-white border-0 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
          />

          {messageInput.trim() ? (
            <button
              onClick={sendMessage}
              className="p-2 bg-green-500 hover:bg-green-600 rounded-full transition-colors"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          ) : (
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <Mic className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Render sidebar
  const renderSidebar = () => {
    const conversations = Object.values(state.conversations).sort(
      (a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)
    )

    return (
      <div className={`w-full md:w-[400px] bg-white flex flex-col ${state.isMobileView && !state.showSidebar ? 'hidden' : ''}`}>
        {/* Header */}
        <div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">WhatsApp</h1>
          <div className="flex gap-2">
            {/* Notification Toggle */}
            <button
              onClick={toggleNotifications}
              className={`p-2 rounded-full transition-colors ${
                state.notificationsEnabled
                  ? 'hover:bg-gray-200 text-green-500'
                  : 'hover:bg-gray-200 text-gray-400'
              }`}
              title={state.notificationsEnabled ? 'Notifications on' : 'Notifications off'}
            >
              {state.notificationsEnabled ? (
                <Bell className="w-5 h-5" />
              ) : (
                <BellOff className="w-5 h-5" />
              )}
            </button>
            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-full transition-colors ${
                state.soundEnabled
                  ? 'hover:bg-gray-200 text-green-500'
                  : 'hover:bg-gray-200 text-gray-400'
              }`}
              title={state.soundEnabled ? 'Sound on' : 'Sound off'}
            >
              {state.soundEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
            </button>
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search or start new chat"
              className="w-full pl-10 pr-4 py-2 bg-[#f0f2f5] border-0 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Connection button when not connected */}
        {!state.isConnected && (
          <div className="p-4 border-b border-gray-100">
            <button
              onClick={() => setShowConnectionModal(true)}
              className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Connect with someone
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Share your ID or link to start chatting
            </p>
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
              <p className="mb-2">No conversations yet</p>
              <p className="text-sm">Connect with someone to start chatting</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.peerId}
                className={`relative group ${state.activeConversation === conv.peerId ? 'bg-gray-100' : ''}`}
              >
                <button
                  onClick={() => {
                    if (!state.isConnected || state.connectedPeerId !== conv.peerId) {
                      connectToPeer(conv.peerId)
                    }
                    setState(prev => ({
                      ...prev,
                      activeConversation: conv.peerId,
                      connectedPeerId: conv.peerId,
                      isConnected: true,
                      showSidebar: !prev.isMobileView
                    }))
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {conv.peerId.slice(-2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800 truncate">{conv.peerId}</h3>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-500">
                          {formatTime(conv.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {conv.lastMessage?.text || 'No messages yet'}
                    </p>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete conversation with ${conv.peerId}?`)) {
                      deleteConversation(conv.peerId)
                    }
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete conversation"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-[#d1d7db]">
      {/* Sidebar */}
      {renderSidebar()}

      {/* Chat Area */}
      <div className={`flex-1 ${state.isMobileView && state.showSidebar ? 'hidden md:flex' : 'flex'}`}>
        {renderChatArea()}
      </div>

      {/* Modals */}
      {renderConnectionModal()}
      {renderIncomingCallModal()}
      {renderVideoCall()}
    </div>
  )
}

export default App
