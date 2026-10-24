import { useState } from 'react'

const operatorStorageKey = 'aroma-infini:order-operator:v1'

function readOperatorName() {
  try {
    return sessionStorage.getItem(operatorStorageKey) ?? ''
  } catch {
    return ''
  }
}

export function useOrderOperator() {
  const [name, updateName] = useState(readOperatorName)

  function setName(value: string) {
    updateName(value)
    try {
      sessionStorage.setItem(operatorStorageKey, value)
    } catch {
      // A restricted browser session can still record the name for this view.
    }
  }

  return {
    operator: { id: null, name: name.trim(), verified: false as const },
    name,
    setName,
  }
}
