import { Inngest } from "inngest";

//create a lient to send and recieve events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

//inngest function to save user data to a database

//create an empty array where we'll export future innget functions
export const functions = [];
