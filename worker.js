class Uplink {
  constructor(aioCredentials, aioGroup, payload) {
    this.aioKey = aioCredentials.aioKey;
    this.aioUsername = aioCredentials.aioUsername;
    this.aioGroup = aioGroup;
    this.payload = payload;

    /*console.log(
      this.aioKey,
      this.aioUsername,
      this.aioGroup,
      JSON.stringify(this.payload),
    );*/
  }

  async doesFeedGroupExist() {
    return await fetch(
      `https://io.adafruit.com/api/v2/${this.aioUsername}/groups/${this.aioGroup}`,
      {
        headers: {
          "x-aio-key": this.aioKey,
        },
      },
    )
    .then(res => res.json())
    .then(json => !!json.id);
  }

  async createFeedGroup() {
    return await fetch(
      `https://io.adafruit.com/api/v2/${this.aioUsername}/groups`,
      {
        method: "POST",
        headers: {
          "x-aio-key": this.aioKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: this.aioGroup }),
      },
    )
    .then(res => res.json());
  }

  async createFeedGroupIfMissing() {
    if (await this.doesFeedGroupExist()) return;
    else await this.createFeedGroup();
  }

  async getExistingFeeds() {
    return await fetch(
      `https://io.adafruit.com/api/v2/${this.aioUsername}/feeds/`,
      {
        headers: {
          "x-aio-key": this.aioKey,
        },
      },
    )
    .then(res => res.json())
    .then(feeds =>
      feeds.filter(feed => feed.group.key === this.aioGroup),
    );
  }

  async createFeed(feedName) {
    return await fetch(
      `https://io.adafruit.com/api/v2/${this.aioUsername}/feeds?group_key=${this.aioGroup}`,
      {
        method: "POST",
        headers: {
          "x-aio-key": this.aioKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ feed: { name: feedName } }),
      },
    )
    .then(res => res.json());
  }

  async getOrCreateFeeds(feedNames) {
    const existingFeeds = await this.getExistingFeeds();
    const missingFeedNames = feedNames.filter(
      (propertyName) =>
        !existingFeeds.some(({ name: feedName }) => propertyName === feedName),
    );

    // Feeds belong to a feed group. If the feeds we want to publish to don't already exist
    // we have ensure the feed group exists before creating them.
    if (missingFeedNames.length) await this.createFeedGroupIfMissing();

    const createdFeeds = await Promise.all(
      missingFeedNames.map(name => this.createFeed(name)),
    );

    console.log("existing feeds: " + existingFeeds.map(({ name }) => name).join(", "));
    console.log("missing feeds: " + missingFeedNames.join(", "));
    console.log("created feeds: " + createdFeeds.map(({ name }) => name).join(", "));

    return [...existingFeeds, ...createdFeeds];
  }

  getUplinkLocation() {
    if (!this.payload.gps_0) return {};

    return {
      lat: this.payload.gps_0.latitude,
      lon: this.payload.gps_0.longitude,
      ele: this.payload.gps_0.altitude,
    };
    /*const gpsFieldName = Object.keys(this.payload).find(k => k.startsWith("gps_"));

    if (!gpsFieldName) return {};

    return {
      lat: this.payload[gpsFieldName].latitude,
      lon: this.payload[gpsFieldName].longitude,
      ele: this.payload[gpsFieldName].altitude
    }*/
  }

  async publishToFeed(key, value) {
    /*if (value.latitude && value.longitude && value.altitude)
      value = `${value.latitude},${value.longitude},${value.altitude}`;*/

    console.log("publish " + key + " " + value);
    return await await fetch(
      `https://io.adafruit.com/api/v2/${this.aioUsername}/feeds/${key}/data`,
      {
        method: "POST",
        headers: {
          "x-aio-key": this.aioKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ datum: { value, ...this.getUplinkLocation() } }),
      },
    ).then(res => res.json());
  }

  async publishPayloadToFeeds() {
    const propertyNames = Object.keys(this.payload).filter(
      // We don't want to publish the GPS field on its own,
      // instead we tag each individual feed entry with the location (see the call to getUplinkLocation() in publishToFeed())
      propertyName => propertyName !== "gps_0",
    );

    const feeds = await this.getOrCreateFeeds(propertyNames);

    const publishRes = await Promise.all(
      propertyNames.map(propertyName =>
        this.publishToFeed(
          feeds.find(({ name }) => propertyName === name).key,
          this.payload[propertyName],
        ),
      ),
    );

    return publishRes;
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const aioKey = request.headers.get("x-aio-key");
      const aioUsername = request.headers.get("x-aio-username");
      const aioGroup = request.headers.get("x-aio-group") || "ttn";

      if (
        url.pathname === "/uplink" &&
        request.method === "POST" &&
        aioKey &&
        aioUsername &&
        aioGroup
      ) {
        const json = await request.json();

        if (!json.uplink_message || !json.uplink_message.decoded_payload) {
          console.log("Dismissing an uplink message because there was no decoded payload");
          return new Response(
            "received no decoded payload - have you set the correct payload formatter & are all types supported?",
            { status: 400 },
          );
        }

        const {
          uplink_message: { decoded_payload },
        } = json;

        const uplink = new Uplink(
          { aioKey, aioUsername },
          aioGroup,
          decoded_payload,
        );
        await uplink.publishPayloadToFeeds();

        return new Response("ok");
      }

      console.error(`Received a bad request. ${request.method} ${url.pathname} x-aio-key: ${aioKey} x-aio-username: ${aioUsername} x-aio-group: ${aioGroup}`);
      return new Response("bad request", { status: 400 });
    } catch (e) {
      console.error("An error occured while processing a request. This may be due to a malformatted payload or invalid Adafruit IO credentials");
      console.error(e, e.stack);
      return new Response("internal server error", { status: 500 });
    }
  },
};
