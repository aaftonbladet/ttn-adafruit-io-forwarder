# The Things Network-Adafruit IO forwarder

This project implements a [Cloudflare Workers](https://cloudflare.com/workers) script that publishes [The Things Network](https://thethingsnetwork.com) (henceforth "TTN") LoRaWAN uplink messages to [Adafruit IO](https://io.adafruit.com). 

Historically the same functionality could be achieved by using the [IFTTT](https://ifttt.com/) integration in TTN, setting up a forwarder in IFTTT. However, since the deployment of TTNv3, the IFTTT support was dropped.

## Deploying the worker

1. Sign up for a free Cloudflare account, then navigate to Workers & Pages in the sidebar of the Cloudflare dashboard. Click Create application and deploy a new worker using the Hello World workers example.
3. Write down the URL of your worker. It'll end in `.workers.dev`
2. Press Edit code, then paste everything from the [worker.js](worker.js) file of this repository.
3. Press deploy in the top right corner to save the new code
4. Follow the steps outlined in [Using the forwarder](#using-the-forwarder) below.

There's also a publicly available instance of the forwarder available at `https://worker-flat-credit-0e82.utbobilin.workers.dev`. It runs on the free version of Cloudflare Workers and is bound by a quota, so please keep in mind it may not always be available. Ideally, you should be running your own instance on your own Cloudflare account.

## Using the forwarder

1. Login to The Things Network and go to your application.
2. In the sidebar to the left, press Integrations, then Webhooks. 
3. Click Create webhook in the top right corner, then select Custom webhook.
4. Enter anything for the Webhook ID, keep Webhook Format as JSON and paste the URL of your Cloudflare Workers instance in the Base URL field.
5. Press "Add header entry" three times under "Additional headers". Fill the empty fields according to the table below.

| Header name    | Value                                                                         |
| -----------    | -----------                                                                   |
| x-aio-username | Your username on Adafruit IO                                                  |
| x-aio-group    | The name of the feed group you want your uplinks to be published to           |
| x-aio-key      | Your Adafruit IO [API key](https://io.adafruit.com/api/docs/#authentication)  |

6. Tick the "Uplink message" checkbox under "Enabled event types" and enter `/uplink` as the path. 
7. Scroll down to the bottom and hit Save changes.

Keep in mind TTN has to be able to decode the payload into JSON. TTN has partial built-in support for [CayenneLPP](https://www.thethingsindustries.com/docs/integrations/payload-formatters/cayenne/), which is what I use for my projects. 

## Tagging your uplinks with a location

If an uplink contains a GPS location on channel 0 (`CayenneLPP::addGPS(0, 55.6001 /* lat */, 13.0103 /* lon */, 5 /* elevation */)`), all other feeds in the uplink will all be tagged with this location. The location will not be published to its own field.

If you aren't using CayenneLPP, your payload formatter should emit a field called `gps_0` to tag the uplink with a location. See getUplinkLocation() in worker.js for details.

## Troubleshooting steps

If your uplinks aren't appearing in the Adafruit dashboard, open the Live Data section in Adafruit IO. 
- Make sure the uplinks are actually reaching TTN. An indicator is the presence of the `Forward uplink data message` events in the Live data section. If they aren't, check the antenna on your and make sure you are within the range of a gateway.
- Check for error messages in Live Data. The `Failed to send webhook` entry in Live Data means your payload was sent to the worker, but it couldn't be forwarded. Checking the event details will show the exact error message returned by the server.
- A common pitfall is using a CayenneLPP type not supported by TTN. Make sure the `decoded_payload` field is set in the `Forward uplink data message` event. If it isn't, try sending a single analogue output field (`CayenneLPP::addAnalogueOutput()`) and see if `decoded_payload` appears.
- Make sure your Adafruit IO API key is valid. You can use this terminal command to check (if curl is installed), make sure to fill your API key, your username and the feed name: `curl -H "x-aio-key: <your AIO api key> -H "content-type: application/json" --data "{\"datum\": {\"value\": 10}}" "https://io.adafruit.com/api/v2/<your aio username>/feeds/<the name of your feed>/data"`. This should publish the value 10 to your feed.