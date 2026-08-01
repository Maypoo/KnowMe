import { createContext, useContext, useState } from 'react'

const TitleBarContext = createContext({
  title: { key: 'default', label: null },
  setTitle: () => {},
})

export function TitleBarProvider({ children }) {
  const [title, setTitle] = useState({ key: 'default', label: null })

  return (
    <TitleBarContext.Provider value={{ title, setTitle }}>
      {children}
    </TitleBarContext.Provider>
  )
}

export function useTitleBar() {
  return useContext(TitleBarContext)
}
