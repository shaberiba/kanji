import * as ping from './ping.js';
import * as createEvent from './create-event.js';
import * as facebookStatus from './facebook-status.js';
import * as eventRole from './event-role.js';

const modules = [ping, createEvent, facebookStatus, eventRole];

export const commands = new Map(modules.map((mod) => [mod.data.name, mod]));

export const commandData = modules.map((mod) => mod.data.toJSON());
