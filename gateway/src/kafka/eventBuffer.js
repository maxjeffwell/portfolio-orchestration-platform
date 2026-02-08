const MAX_SIZE = 100;

class EventBuffer {
  constructor() {
    this.events = [];
  }

  add(event) {
    this.events.push(event);
    if (this.events.length > MAX_SIZE) this.events.shift();
  }

  getAll() {
    return [...this.events];
  }
}

export const eventBuffer = new EventBuffer();
