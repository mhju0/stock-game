const encoder = new TextEncoder()

export function isStrongPassword(password) {
  return password.length >= 8 &&
    encoder.encode(password).length <= 72 &&
    /\p{L}/u.test(password) &&
    /\p{N}/u.test(password)
}
