export default function Logo({ size = 24, className = '', monochrome = false }) {
  if (monochrome) {
    return (
      <span
        role="img"
        aria-label="KnowMe"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          backgroundColor: 'currentColor',
          WebkitMaskImage: 'url(/isotipo.svg)',
          maskImage: 'url(/isotipo.svg)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
        className={className}
      />
    )
  }

  return (
    <img
      src="/isotipo.svg"
      alt="KnowMe"
      width={size}
      height={size}
      draggable={false}
      className={className}
    />
  )
}
