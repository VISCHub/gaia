import bitcoin from 'bitcoinjs-lib'

import { ValidationError } from './errors'

function pubkeyHexToECPair (pubkeyHex) {
  const pkBuff = Buffer.from(pubkeyHex, 'hex')
  return bitcoin.ECPair.fromPublicKeyBuffer(pkBuff)
}

export class StorageAuthentication {
  constructor (publickey, signature) {
    this.publickey = publickey
    this.signature = signature
  }

  static challengeText () {
    const header = 'gaiahub'
    const dateParts = new Date().toISOString().split('T')[0]
          .split('-')
    // for right now, access tokens are valid for the calendar year.
    const allowedSpan = dateParts[0]
    const myChallenge = 'blockstack_storage_please_sign'
    const myURL = 'storage.blockstack.org'
    return JSON.stringify( [header, allowedSpan, myURL, myChallenge] )
  }

  static makeWithKey (secretKey) {
    const publickey = bitcoin.ECPair.fromPublicKeyBuffer(
      secretKey.getPublicKeyBuffer()) // I hate you bitcoinjs-lib.
    const rawText = StorageAuthentication.challengeText()
    const digest = bitcoin.crypto.sha256(rawText)
    const signature = secretKey.sign(digest)
    return new StorageAuthentication(publickey, signature)
  }

  static fromAuthHeader (authHeader) {
    if (!authHeader.startsWith('bearer')) {
      return false
    }

    const authPart = authHeader.slice('bearer '.length)
    const decoded = JSON.parse(Buffer.from(authPart, 'base64').toString())
    const publickey = pubkeyHexToECPair(decoded.publickey)
    const signature = bitcoin.ECSignature.fromDER(
      Buffer.from(decoded.signature, 'hex'))
    return new StorageAuthentication(publickey, signature)
  }

  toAuthHeader () {
    const authObj = {
      publickey : this.publickey.getPublicKeyBuffer().toString('hex'),
      signature : this.signature.toDER().toString('hex')
    }
    // I realize that I'm b64 encoding hex encodings, but
    //  this keeps the formats from getting hateful.
    const authToken = Buffer.from(JSON.stringify(authObj)).toString('base64')
    return `bearer ${authToken}`
  }

  isAuthenticationValid (address, throwFailure) {
    if (this.publickey.getAddress() !== address) {
      if (throwFailure) {
        throw new ValidationError('Address not allowed to write on this path')
      }
      return false
    }
    const rawText = StorageAuthentication.challengeText()
    const digest = bitcoin.crypto.sha256(rawText)
    const valid = (this.publickey.verify(digest, this.signature) === true)

    if (throwFailure && !valid) {
      throw new ValidationError('Invalid signature or expired authentication token.')
    }
    return valid
  }
}
