export class Transcript {
  constructor({ text, meta }) {
    this.text = text
    this.meta = meta ?? {}
  }
}
