const STATE_KEY = 'knowme_demo_state_v1'
const STATE_VERSION = 12

function nowIso(offsetMs = 0) {
  return new Date(Date.now() - offsetMs).toISOString()
}

function face(n) {
  return `https://i.pravatar.cc/150?img=${n}`
}

function seed() {
  const users = [
    { id: 'demo-test', username: '@test', avatar_url: null, bio: 'Cuenta de prueba del modo demo.', follower_count: 9, friend_count: 7 },
    { id: 'demo-luna', username: '@luna', avatar_url: face(47), bio: 'Café, caminatas y buenas charlas.', follower_count: 24, friend_count: 18 },
    { id: 'demo-mateo', username: '@mateo', avatar_url: face(53), bio: 'Músico de fin de semana.', follower_count: 15, friend_count: 12 },
    { id: 'demo-sasha', username: '@sasha', avatar_url: face(44), bio: 'Nueva por acá, vengo a conocer gente.', follower_count: 6, friend_count: 5 },
    { id: 'demo-leo', username: '@leo', avatar_url: face(59), bio: 'Gamer nocturno.', follower_count: 11, friend_count: 9 },
    { id: 'demo-naty', username: '@naty', avatar_url: face(31), bio: 'Colecciono playlists.', follower_count: 19, friend_count: 14 },
    { id: 'demo-valen', username: '@valen', avatar_url: face(25), bio: 'Estudiante y runner.', follower_count: 31, friend_count: 22 },
    { id: 'demo-thiago', username: '@thiago', avatar_url: face(15), bio: 'Toco la guitarra y saco fotos.', follower_count: 13, friend_count: 10 },
    { id: 'demo-cami', username: '@cami', avatar_url: face(32), bio: 'Dibujo todo lo que veo.', follower_count: 27, friend_count: 16 },
    { id: 'demo-joaco', username: '@joaco', avatar_url: face(61), bio: 'Juegos de mesa y videojuegos.', follower_count: 8, friend_count: 7 },
    { id: 'demo-mili', username: '@mili', avatar_url: face(26), bio: 'Siempre buscando música nueva.', follower_count: 17, friend_count: 11 },
    { id: 'demo-santi', username: '@santi', avatar_url: face(17), bio: 'Gimnasio y vida sana.', follower_count: 9, friend_count: 8 },
    { id: 'demo-agus', username: '@agus', avatar_url: face(45), bio: 'Cocinera en proceso.', follower_count: 21, friend_count: 15 },
    { id: 'demo-benja', username: '@benja', avatar_url: face(68), bio: 'Programo de noche.', follower_count: 7, friend_count: 6 },
    { id: 'demo-flor', username: '@flor', avatar_url: face(20), bio: 'Dueña de un gato famoso.', follower_count: 33, friend_count: 20 },
    { id: 'demo-delfi', username: '@delfi', avatar_url: face(48), bio: 'Leo de todo.', follower_count: 12, friend_count: 9 },
    { id: 'demo-nacho', username: '@nacho', avatar_url: face(64), bio: 'Fanático del fútbol.', follower_count: 14, friend_count: 13 },
    { id: 'demo-tomi', username: '@tomi', avatar_url: face(11), bio: 'Viajero improvisado.', follower_count: 18, friend_count: 12 },
    { id: 'demo-juli', username: '@juli', avatar_url: face(16), bio: 'Cine y series sin parar.', follower_count: 10, friend_count: 8 },
    { id: 'demo-renzo', username: '@renzo', avatar_url: face(60), bio: 'Hago fotos analógicas.', follower_count: 5, friend_count: 4 },
  ]
  const byId = (id) => users.find(u => u.id === id)
  const friendEntry = (id, seenMs) => {
    const u = byId(id)
    return { id: u.id, username: u.username, avatar_url: u.avatar_url, last_seen_at: nowIso(seenMs) }
  }
  return {
    v: STATE_VERSION,
    profile: {
      id: 'demo-test',
      username: '@test',
      email: 'test@demo.local',
      avatar_url: null,
      bio: 'Cuenta de prueba del modo demo.',
      birth_date: null,
      show_age: false,
      country: null,
      show_country: false,
      show_activity: true,
      created_at: nowIso(400 * 86400000),
      follower_count: 9,
      friend_count: 7,
    },
    users,
    feedPosts: [
      { id: 'demo-post-1', content: 'Busco gente para aprender portugués desde cero, practicamos por acá.', username: '@tomi', display_name: '@tomi', avatar_url: byId('demo-tomi').avatar_url, likes_count: 3, liked_by_me: false, friend_request_status: null, created_at: nowIso(4 * 60000), tags: [{ id: 6, name: 'idiomas' }] },
      { id: 'demo-post-2', content: 'Busco gente para jugar al ajedrez online, nivel intermedio.', username: '@valen', display_name: '@valen', avatar_url: byId('demo-valen').avatar_url, likes_count: 14, liked_by_me: true, friend_request_status: 'accepted', created_at: nowIso(11 * 60000), tags: [{ id: 2, name: 'juegos' }] },
      { id: 'demo-post-3', content: 'Formé una banda pero nos falta baterista, alguien se suma?', username: '@thiago', display_name: '@thiago', avatar_url: byId('demo-thiago').avatar_url, likes_count: 7, liked_by_me: false, friend_request_status: 'accepted', created_at: nowIso(26 * 60000), tags: [{ id: 1, name: 'musica' }] },
      { id: 'demo-post-4', content: 'Busco gente para charlar de libros de fantasía y pasarnos recomendaciones.', username: '@luna', display_name: '@luna', avatar_url: byId('demo-luna').avatar_url, likes_count: 21, liked_by_me: true, friend_request_status: 'accepted', created_at: nowIso(48 * 60000), tags: [{ id: 7, name: 'libros' }] },
      { id: 'demo-post-5', content: 'Busco gente para jugar al FIFA online los sábados.', username: '@nacho', display_name: '@nacho', avatar_url: byId('demo-nacho').avatar_url, likes_count: 9, liked_by_me: false, friend_request_status: null, created_at: nowIso(75 * 60000), tags: [{ id: 5, name: 'futbol' }, { id: 2, name: 'juegos' }] },
      { id: 'demo-post-6', content: 'Busco gente para compartir dibujos y pasarnos tips.', username: '@cami', display_name: '@cami', avatar_url: byId('demo-cami').avatar_url, likes_count: 18, liked_by_me: false, friend_request_status: 'accepted', created_at: nowIso(100 * 60000), tags: [{ id: 8, name: 'arte' }] },
      { id: 'demo-post-7', content: 'Quiero hacer amigos, me llamo Sasha y soy nueva por acá. Alguien para charlar?', username: '@sasha', display_name: '@sasha', avatar_url: byId('demo-sasha').avatar_url, likes_count: 8, liked_by_me: false, friend_request_status: 'accepted', created_at: nowIso(130 * 60000), tags: [{ id: 9, name: 'amistad' }] },
      { id: 'demo-post-8', content: 'Abrí un servidor de Discord para noches de juegos, faltan jugadores.', username: '@joaco', display_name: '@joaco', avatar_url: byId('demo-joaco').avatar_url, likes_count: 6, liked_by_me: false, friend_request_status: 'accepted', created_at: nowIso(160 * 60000), tags: [{ id: 2, name: 'juegos' }] },
      { id: 'demo-post-9', content: 'Busco gente para intercambiar música y armar playlists juntos.', username: '@mili', display_name: '@mili', avatar_url: byId('demo-mili').avatar_url, likes_count: 11, liked_by_me: false, friend_request_status: null, created_at: nowIso(200 * 60000), tags: [{ id: 1, name: 'musica' }] },
      { id: 'demo-post-10', content: 'Hice un servidor de Minecraft, necesito personas que se sumen.', username: '@leo', display_name: '@leo', avatar_url: byId('demo-leo').avatar_url, likes_count: 2, liked_by_me: false, friend_request_status: null, created_at: nowIso(240 * 60000), tags: [{ id: 2, name: 'juegos' }] },
      { id: 'demo-post-11', content: 'Busco gente para estudiar juntos por videollamada.', username: '@santi', display_name: '@santi', avatar_url: byId('demo-santi').avatar_url, likes_count: 5, liked_by_me: false, friend_request_status: null, created_at: nowIso(300 * 60000), tags: [{ id: 10, name: 'estudio' }] },
      { id: 'demo-post-12', content: 'Busco gente para intercambiar recetas y fotos de sus platos.', username: '@agus', display_name: '@agus', avatar_url: byId('demo-agus').avatar_url, likes_count: 16, liked_by_me: true, friend_request_status: 'pending', created_at: nowIso(360 * 60000), tags: [{ id: 11, name: 'cocina' }] },
      { id: 'demo-post-13', content: 'Arranqué un proyecto open source y necesito gente que se sume a programar.', username: '@benja', display_name: '@benja', avatar_url: byId('demo-benja').avatar_url, likes_count: 4, liked_by_me: false, friend_request_status: null, created_at: nowIso(430 * 60000), tags: [{ id: 12, name: 'programacion' }] },
      { id: 'demo-post-14', content: 'Busco gente amante de los gatos para compartir fotos y tips.', username: '@flor', display_name: '@flor', avatar_url: byId('demo-flor').avatar_url, likes_count: 24, liked_by_me: false, friend_request_status: null, created_at: nowIso(500 * 60000), tags: [{ id: 13, name: 'mascotas' }] },
      { id: 'demo-post-15', content: 'Creé un club de cine y necesito miembros para el debate post peli.', username: '@juli', display_name: '@juli', avatar_url: byId('demo-juli').avatar_url, likes_count: 6, liked_by_me: false, friend_request_status: null, created_at: nowIso(580 * 60000), tags: [{ id: 4, name: 'cine' }] },
    ],
    myPost: null,
    friends: [
      friendEntry('demo-luna', 45000),
      friendEntry('demo-mateo', 120000),
      friendEntry('demo-valen', 300000),
      friendEntry('demo-thiago', 900000),
      friendEntry('demo-cami', 2400000),
      friendEntry('demo-sasha', 5400000),
      friendEntry('demo-joaco', 90000000),
    ],
    incoming: [
      { id: 'demo-req-1', sender: { id: 'demo-leo', username: '@leo', avatar_url: face(59) } },
      { id: 'demo-req-2', sender: { id: 'demo-mili', username: '@mili', avatar_url: face(26) } },
      { id: 'demo-req-3', sender: { id: 'demo-santi', username: '@santi', avatar_url: face(17) } },
    ],
    outgoing: [
      { id: 'demo-pen-1', receiver: { id: 'demo-naty', username: '@naty', avatar_url: face(31) } },
      { id: 'demo-pen-2', receiver: { id: 'demo-agus', username: '@agus', avatar_url: face(45) } },
    ],
    chats: [
      {
        id: 'demo-chat-luna',
        isGroup: false,
        otherUser: { id: 'demo-luna', username: '@luna', avatar_url: face(47), last_seen_at: nowIso(45000) },
        lastMessage: { content: 'Dale, mañana coordinamos!', created_at: nowIso(2 * 60000), sender_id: 'demo-luna', sender_name: '@luna', type: 'text' },
        unreadCount: 2,
        updatedAt: nowIso(2 * 60000),
      },
      {
        id: 'demo-chat-juegos',
        isGroup: true,
        name: 'Noche de juegos',
        icon_url: null,
        memberCount: 4,
        lastMessage: { content: 'Ya somos 5 para el viernes', created_at: nowIso(9 * 60000), sender_id: 'demo-leo', sender_name: '@leo', type: 'text' },
        unreadCount: 3,
        updatedAt: nowIso(9 * 60000),
      },
      {
        id: 'demo-chat-valen',
        isGroup: false,
        otherUser: { id: 'demo-valen', username: '@valen', avatar_url: face(25), last_seen_at: nowIso(300000) },
        lastMessage: { content: 'Felicitaciones por el examen!', created_at: nowIso(20 * 60000), sender_id: 'demo-test', sender_name: '@test', type: 'text' },
        unreadCount: 0,
        updatedAt: nowIso(20 * 60000),
      },
      {
        id: 'demo-chat-grupo',
        isGroup: true,
        name: 'Grupo demo',
        icon_url: null,
        memberCount: 5,
        lastMessage: { content: 'Bienvenidos los nuevos!', created_at: nowIso(55 * 60000), sender_id: 'demo-sasha', sender_name: '@sasha', type: 'text' },
        unreadCount: 0,
        updatedAt: nowIso(55 * 60000),
      },
      {
        id: 'demo-chat-mateo',
        isGroup: false,
        otherUser: { id: 'demo-mateo', username: '@mateo', avatar_url: face(53), last_seen_at: nowIso(120000) },
        lastMessage: { content: 'Pasame ese tema cuando puedas', created_at: nowIso(95 * 60000), sender_id: 'demo-mateo', sender_name: '@mateo', type: 'text' },
        unreadCount: 0,
        updatedAt: nowIso(95 * 60000),
      },
      {
        id: 'demo-chat-mili',
        isGroup: false,
        otherUser: { id: 'demo-mili', username: '@mili', avatar_url: face(26), last_seen_at: nowIso(600000) },
        lastMessage: { content: 'Vi tu perfil y tenemos gustos parecidos', created_at: nowIso(150 * 60000), sender_id: 'demo-mili', sender_name: '@mili', type: 'text' },
        unreadCount: 1,
        updatedAt: nowIso(150 * 60000),
      },
    ],
    messagesByChat: {
      'demo-chat-luna': {
        isGroup: false,
        isFriend: true,
        pendingRequest: false,
        isAdmin: false,
        name: null,
        icon_url: null,
        participants: [],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-1', sender_id: 'demo-luna', content: 'Hola test! Cómo anda todo?', created_at: nowIso(40 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@luna', avatar_url: face(47) } },
          { id: 'demo-m-2', sender_id: 'demo-test', content: 'Todo bien! Probando el demo de KnowMe.', created_at: nowIso(35 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@test', avatar_url: null } },
          { id: 'demo-m-3', sender_id: 'demo-luna', content: 'Está buenísimo, me encanta el feed.', created_at: nowIso(30 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@luna', avatar_url: face(47) } },
          { id: 'demo-m-4', sender_id: 'demo-luna', content: 'Mañana sale café virtual?', created_at: nowIso(5 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@luna', avatar_url: face(47) } },
          { id: 'demo-m-5', sender_id: 'demo-luna', content: 'Dale, mañana coordinamos!', created_at: nowIso(2 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@luna', avatar_url: face(47) } },
        ],
      },
      'demo-chat-juegos': {
        isGroup: true,
        isFriend: true,
        pendingRequest: false,
        isAdmin: false,
        name: 'Noche de juegos',
        icon_url: null,
        participants: [
          { id: 'demo-test', username: '@test', avatar_url: null, is_admin: false },
          { id: 'demo-mateo', username: '@mateo', avatar_url: face(53), is_admin: true },
          { id: 'demo-joaco', username: '@joaco', avatar_url: face(61), is_admin: false },
          { id: 'demo-leo', username: '@leo', avatar_url: face(59), is_admin: false },
        ],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-10', sender_id: 'demo-mateo', content: 'Gente, viernes noche de juegos online.', created_at: nowIso(60 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@mateo', avatar_url: face(53) } },
          { id: 'demo-m-11', sender_id: 'demo-joaco', content: 'Dale, yo creo la sala en Discord.', created_at: nowIso(45 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@joaco', avatar_url: face(61) } },
          { id: 'demo-m-12', sender_id: 'demo-test', content: 'Yo me sumo, avisen la hora.', created_at: nowIso(30 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@test', avatar_url: null } },
          { id: 'demo-m-13', sender_id: 'demo-leo', content: 'Ya somos 5 para el viernes', created_at: nowIso(9 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@leo', avatar_url: face(59) } },
        ],
      },
      'demo-chat-valen': {
        isGroup: false,
        isFriend: true,
        pendingRequest: false,
        isAdmin: false,
        name: null,
        icon_url: null,
        participants: [],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-20', sender_id: 'demo-valen', content: 'Adiviná quién aprobó todo!', created_at: nowIso(50 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@valen', avatar_url: face(25) } },
          { id: 'demo-m-21', sender_id: 'demo-test', content: 'Felicitaciones por el examen!', created_at: nowIso(20 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@test', avatar_url: null } },
        ],
      },
      'demo-chat-grupo': {
        isGroup: true,
        isFriend: true,
        pendingRequest: false,
        isAdmin: true,
        name: 'Grupo demo',
        icon_url: null,
        participants: [
          { id: 'demo-test', username: '@test', avatar_url: null, is_admin: true },
          { id: 'demo-luna', username: '@luna', avatar_url: face(47), is_admin: false },
          { id: 'demo-mateo', username: '@mateo', avatar_url: face(53), is_admin: false },
          { id: 'demo-sasha', username: '@sasha', avatar_url: face(44), is_admin: false },
          { id: 'demo-cami', username: '@cami', avatar_url: face(32), is_admin: false },
        ],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-30', sender_id: 'demo-test', content: 'Bienvenidos al grupo demo!', created_at: nowIso(120 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@test', avatar_url: null } },
          { id: 'demo-m-31', sender_id: 'demo-cami', content: 'Gracias! Qué bueno que está esto.', created_at: nowIso(90 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@cami', avatar_url: face(32) } },
          { id: 'demo-m-32', sender_id: 'demo-sasha', content: 'Bienvenidos los nuevos!', created_at: nowIso(55 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@sasha', avatar_url: face(44) } },
        ],
      },
      'demo-chat-mateo': {
        isGroup: false,
        isFriend: true,
        pendingRequest: false,
        isAdmin: false,
        name: null,
        icon_url: null,
        participants: [],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-40', sender_id: 'demo-mateo', content: 'Che, escuchaste el último disco?', created_at: nowIso(180 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@mateo', avatar_url: face(53) } },
          { id: 'demo-m-41', sender_id: 'demo-test', content: 'Todavía no, pasamelo.', created_at: nowIso(170 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@test', avatar_url: null } },
          { id: 'demo-m-42', sender_id: 'demo-mateo', content: 'Pasame ese tema cuando puedas', created_at: nowIso(95 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@mateo', avatar_url: face(53) } },
        ],
      },
      'demo-chat-mili': {
        isGroup: false,
        isFriend: false,
        pendingRequest: false,
        isAdmin: false,
        name: null,
        icon_url: null,
        participants: [],
        blockedByMe: [],
        messages: [
          { id: 'demo-m-50', sender_id: 'demo-mili', content: 'Vi tu perfil y tenemos gustos parecidos', created_at: nowIso(150 * 60000), edited_at: null, deleted: false, type: 'text', sender: { username: '@mili', avatar_url: face(26) } },
        ],
      },
    },
    notifications: [
      { id: 'demo-n-1', type: 'follow', fromUser: { id: 'demo-leo', username: '@leo', avatar_url: face(59) }, isFollowingBack: false, createdAt: nowIso(15 * 60000) },
      { id: 'demo-n-2', type: 'friend_accept', fromUser: { id: 'demo-sasha', username: '@sasha', avatar_url: face(44) }, isFollowingBack: false, createdAt: nowIso(50 * 60000) },
      { id: 'demo-n-3', type: 'follow', fromUser: { id: 'demo-cami', username: '@cami', avatar_url: face(32) }, isFollowingBack: false, createdAt: nowIso(90 * 60000) },
      { id: 'demo-n-4', type: 'unfollow', fromUser: { id: 'demo-mili', username: '@mili', avatar_url: face(26) }, isFollowingBack: false, createdAt: nowIso(140 * 60000) },
      { id: 'demo-n-5', type: 'follow', fromUser: { id: 'demo-joaco', username: '@joaco', avatar_url: face(61) }, isFollowingBack: true, createdAt: nowIso(200 * 60000) },
      { id: 'demo-n-6', type: 'friend_accept', fromUser: { id: 'demo-thiago', username: '@thiago', avatar_url: face(15) }, isFollowingBack: false, createdAt: nowIso(280 * 60000) },
    ],
    tags: [
      { id: 1, name: 'musica' },
      { id: 2, name: 'juegos' },
      { id: 3, name: 'demo' },
      { id: 4, name: 'cine' },
      { id: 5, name: 'futbol' },
      { id: 6, name: 'idiomas' },
      { id: 7, name: 'libros' },
      { id: 8, name: 'arte' },
      { id: 9, name: 'amistad' },
      { id: 10, name: 'estudio' },
      { id: 11, name: 'cocina' },
      { id: 12, name: 'programacion' },
      { id: 13, name: 'mascotas' },
    ],
    prefTagIds: [3, 1],
    blocked: [],
    seq: 100,
  }
}

export function loadDemoState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) {
      const s = seed()
      localStorage.setItem(STATE_KEY, JSON.stringify(s))
      return s
    }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== STATE_VERSION || !parsed.profile) {
      const s = seed()
      localStorage.setItem(STATE_KEY, JSON.stringify(s))
      return s
    }
    return parsed
  } catch {
    return seed()
  }
}

export function saveDemoState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {}
}

export function resetDemoState() {
  const s = seed()
  saveDemoState(s)
  return s
}

export function nextDemoId(state, prefix) {
  state.seq = (state.seq || 100) + 1
  return `${prefix}-${state.seq}`
}
