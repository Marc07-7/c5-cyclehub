import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { MessageCircle, Send, X, RefreshCw, UserRound, Circle } from 'lucide-react'
import { request } from '../api'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

export default function ChatWidget({ user, onClose }) {
  const [contacts, setContacts] = useState([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState('')
  const socketRef = useRef(null)
  const bottomRef = useRef(null)
  const activeIdRef = useRef('')
  const messagesRequestRef = useRef(0)
  activeIdRef.current = activeId

  const activeContact = useMemo(
    () => contacts.find(contact => String(contact.id) === String(activeId)),
    [contacts, activeId]
  )

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true)
    setError('')
    try {
      const result = await request('chat/contacts')
      const list = Array.isArray(result.data) ? result.data : []
      setContacts(list)
      setActiveId(current => {
        if (current && list.some(item => String(item.id) === String(current))) return current
        return list.length ? String(list[0].id) : ''
      })
    } catch (e) {
      setError(e.message || 'Unable to load chat contacts.')
    } finally {
      setLoadingContacts(false)
    }
  }, [])

  const loadMessages = useCallback(async peerId => {
  if (!peerId) {
    setMessages([])
    return
  }

  const requestId = ++messagesRequestRef.current;

  setLoadingMessages(true);
  setError('');

  try {
    const result = await request(`chat/${peerId}`);

    if (requestId !== messagesRequestRef.current) return;

    setMessages(Array.isArray(result.data) ? result.data : []);
  } catch (e) {
    if (requestId !== messagesRequestRef.current) return;

    setError(e.message || 'Unable to load conversation.');
  } finally {
    if (requestId === messagesRequestRef.current) {
      setLoadingMessages(false);
    }
  }
}, []);

  useEffect(() => { loadContacts() }, [loadContacts])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    loadMessages(activeId)
    const socket = socketRef.current
    if (socket?.connected) socket.emit('chat:join', { withUserId: Number(activeId) })
  }, [activeId, loadMessages])

  useEffect(() => {
    const socket = io(SOCKET_URL, { withCredentials: true, transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => {
      setConnection('connected')
      if (activeIdRef.current) socket.emit('chat:join', { withUserId: Number(activeIdRef.current) })
    })
    socket.on('disconnect', () => setConnection('disconnected'))
    socket.on('connect_error', () => setConnection('disconnected'))
    socket.on('chat:message', incoming => {
      const me = Number(user.id)
      const peer = Number(activeIdRef.current)
      if (Number(incoming.sender_id) === me || Number(incoming.receiver_id) === me) {
        if (Number(incoming.sender_id) === peer || Number(incoming.receiver_id) === peer) {
          setMessages(current => current.some(item => Number(item.id) === Number(incoming.id)) ? current : [...current, incoming])
        }
        setContacts(current => current.map(contact =>
          Number(contact.id) === Number(incoming.sender_id === me ? incoming.receiver_id : incoming.sender_id)
            ? { ...contact, last_message: incoming.message, last_message_at: incoming.created_at }
            : contact
        ))
      }
    })
    return () => { socket.disconnect(); socketRef.current = null }
  }, [user.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages])

  async function sendMessage(event) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || !activeId || sending) return
    if (message.length > 2000) { setError('Messages must be 2,000 characters or fewer.'); return }
    const socket = socketRef.current
    if (!socket?.connected) { setError('Chat is offline. Reconnect to send messages.'); return }
    setSending(true)
    setError('')
    socket.emit('chat:send', { receiverId: Number(activeId), message }, ack => {
      setSending(false)
      if (!ack?.success) { setError(ack?.message || 'Message could not be sent.'); return }
      setDraft('')
      setMessages(current => current.some(item => Number(item.id) === Number(ack.data.id)) ? current : [...current, ack.data])
    })
  }

  function formatTime(value) {
    if (!value) return ''
    const date = new Date(String(value).replace(' ', 'T'))
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <section className="c5-chat" aria-label="Customer support chat">
      <header className="c5-chat-head">
        <div className="c5-chat-heading">
          <span className="c5-chat-icon"><MessageCircle size={19} /></span>
          <span><b>CycleHub Chat</b><small><i className={connection === 'connected' ? 'online' : ''} />{connection === 'connected' ? 'Connected' : 'Reconnecting…'}</small></span>
        </div>
        <button type="button" className="c5-chat-close" onClick={onClose} aria-label="Close chat"><X size={19} /></button>
      </header>
      <div className="c5-chat-body">
        <aside className="c5-chat-contacts">
          <div className="c5-chat-label">{user.role === 'admin' ? 'CUSTOMERS' : 'C5 CYCLEHUB SELLER / ADMIN'}</div>
          {loadingContacts ? <p className="c5-chat-hint">Loading contacts…</p> : contacts.length === 0 ? <p className="c5-chat-hint">No chat contacts available.</p> : contacts.map(contact => (
            <button type="button" key={contact.id} className={`c5-chat-contact ${String(activeId) === String(contact.id) ? 'active' : ''}`} onClick={() => setActiveId(String(contact.id))}>
              <span className="c5-chat-avatar"><UserRound size={17} /></span>
              <span className="c5-chat-contact-text"><b>{contact.name || contact.email || `User #${contact.id}`}</b><small>{contact.last_message || contact.email || (user.role === 'admin' ? 'Customer' : 'Seller / Administrator')}</small></span>
            </button>
          ))}
        </aside>
        <div className="c5-chat-conversation">
          {activeContact ? <>
            <div className="c5-chat-peer"><span className="c5-chat-avatar"><UserRound size={17} /></span><span><b>{activeContact.name || activeContact.email}</b><small>{user.role === 'admin' ? 'Customer' : 'C5 CycleHub Seller / Admin'}</small></span><button type="button" onClick={() => loadMessages(activeId)} aria-label="Refresh messages"><RefreshCw size={16} /></button></div>
            <div className="c5-chat-messages">
              {loadingMessages ? <p className="c5-chat-hint">Loading conversation…</p> : messages.length === 0 ? <div className="c5-chat-empty"><MessageCircle size={26} /><b>Start a conversation</b><span>Send a message to {activeContact.name || 'this contact'}.</span></div> : messages.map(message => {
                const mine = Number(message.sender_id) === Number(user.id)
                return <div key={message.id} className={`c5-chat-message ${mine ? 'mine' : ''}`}><p>{message.message}</p><small>{formatTime(message.created_at)}</small></div>
              })}
              <div ref={bottomRef} />
            </div>
            {error && <div className="c5-chat-error">{error}</div>}
            <form className="c5-chat-compose" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} placeholder="Write a message…" aria-label="Message" /><button type="submit" disabled={!draft.trim() || sending || connection !== 'connected'} aria-label="Send message"><Send size={17} /></button></form>
          </> : <div className="c5-chat-empty"><MessageCircle size={28} /><b>{loadingContacts ? 'Loading chat…' : 'No conversations yet'}</b><span>{error || 'No active administrator account was found. Please ask the store administrator to activate an admin account.'}</span></div>}
        </div>
      </div>
    </section>
  )
}
