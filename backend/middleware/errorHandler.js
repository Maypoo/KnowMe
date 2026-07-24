export default function errorHandler(err, req, res, next) {
  console.error(err)

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado grande. Usá una de menos de 10 MB.' })
  }

  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message })
  }

  res.status(500).json({ error: 'Error interno del servidor' })
}
