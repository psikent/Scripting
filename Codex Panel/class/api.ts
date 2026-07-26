import { fetch } from "scripting";

class API {
  private KEY = "setting";

  private base = "https://chatgpt.com";
  token = "";

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  async save() {
    return Storage.set(this.KEY, {
      token: this.token,
    });
  }

  async getUsage() {
    return await fetch(`${this.base}/backend-api/wham/usage`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
    }).then((r) => r.json());
  }
}

export const api = new API();