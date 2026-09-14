import * as ping from './ping.js';
import * as createEvent from './create-event.js';
import * as createPost from './create-post.js';
import * as facebookStatus from './facebook-status.js';
import * as eventRole from './event-role.js';
import * as eventsChannel from './events-channel.js';
import * as syncEvents from './sync-events.js';

const modules = [ping, createEvent, createPost, facebookStatus, eventRole, eventsChannel, syncEvents];

export const commands = new Map(modules.map((mod) => [mod.data.name, mod]));

export const commandData = modules.map((mod) => mod.data.toJSON());
