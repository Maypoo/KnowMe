import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { isLocalOrigin } from './lib/utils.js'
import { ensureAvatarBucket } from './lib/profile.js'
import { setupSocket } from './src/socket.js'
import { csrfProtection } from './middleware/csrf.js'
import { mutationLimiter } from './middleware/rateLimit.js'
import errorHandler from './middleware/errorHandler.js'

import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import usersRoutes from './routes/users.js'
import friendsRoutes from './routes/friends.js'
import followRoutes from './routes/follow.js'
import notificationsRoutes from './routes/notifications.js'
import blocksRoutes from './routes/blocks.js'
import chatsRoutes from './routes/chats.js'
import callsRoutes from './routes/calls.js'
import postsRoutes from './routes/posts.js'
import tagsRoutes from './routes/tags.js'
import preferencesRoutes from './routes/preferences.js'

const app = express()

app.use(helmet())
app.set('trust proxy', 1)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new Error('No autorizado por CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())
app.use(csrfProtection(allowedOrigins))
app.use(mutationLimiter)

app.use('/api/auth', authRoutes)
app.use('/api', profileRoutes)
app.use('/api', usersRoutes)
app.use('/api', friendsRoutes)
app.use('/api', followRoutes)
app.use('/api', notificationsRoutes)
app.use('/api', blocksRoutes)
app.use('/api', chatsRoutes)
app.use('/api', callsRoutes)
app.use('/api', postsRoutes)
app.use('/api', tagsRoutes)
app.use('/api', preferencesRoutes)

app.use(errorHandler)

const server = http.createServer(app)
setupSocket(server)

const PORT = process.env.PORT || 3001
server.listen(PORT, async () => {
  await ensureAvatarBucket()
  console.log(`KnowMe API running on port ${PORT}`)
})
