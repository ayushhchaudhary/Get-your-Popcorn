import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Bookings.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";

//create a lient to send and recieve events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

//inngest function to save user data to a database
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await User.create(userData);
  }
);

//inngest function to delete user from database
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const { id } = event.data;
    await User.findByIdAndDelete(id);
  }
);

//inngest function to update user data in database
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await User.findByIdAndUpdate(id, userData);
  }
);

//Inngest function to cancel booking and release seats of show after 10 mins of booking created if payment is not made
const releaseSeatsAndDeleteBooking = inngest.createFunction(
  { id: "release-seats-delete-booking" },
  { event: "app/checkpayment" },
  async ({ event, step }) => {
    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);
    await step.sleepUntil("wait-for-10-minutes", tenMinutesLater);

    await step.run("check-payment-status", async () => {
      const bookingId = event.data.bookingId;
      const booking = await Booking.findById(bookingId);

      //If payment is not made, release seats and delete booking
      if (!booking.isPaid) {
        const show = await Show.findById(booking.show);
        booking.bookedSeats.forEach((seat) => {
          delete show.occupiedSeats[seat];
        });
        show.markModified("occupiedSeats");
        await show.save();
        await Booking.findByIdAndDelete(booking._id);
      }
    });
  }
);

//inngest function to send email to the user
const sendBookingConfirmationEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email" },
  { event: "app/show.booked" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const booking = await Booking.findById(bookingId)
      .populate({
        path: "show",
        populate: { path: "movie", model: "Movie" },
      })
      .populate("user");
    await sendEmail({
      to: booking.user.email,
      subject: `Payment Confirmation: "${booking.show.movie.title}" booked!`,
      body: `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Booking Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">

      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f4f4f4">
        <tr>
          <td>
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; border: 1px solid #cccccc; background-color: #ffffff;">

              <tr>
                <td align="center" bgcolor="#F84565" style="padding: 30px 0 30px 0;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Booking Confirmed!</h1>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px 40px 30px; line-height: 1.6;">
                  <h2 style="margin-top: 0;">Hey, ${booking.user.name},</h2>
                  <p>Thank you for booking with us. Your booking for the movie <strong style="color: #F84565;">${
                    booking.show.movie.title
                  }</strong> is confirmed.</p>

                  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #dddddd; padding: 20px; margin-top: 20px; margin-bottom: 20px;">
                    <tr>
                      <td style="padding-bottom: 10px;" colspan="2">
                        <h3 style="margin: 0; color: #333333;">Your Booking Details:</h3>
                      </td>
                    </tr>
                    <tr>
                      <td width="100" style="padding: 5px 0;"><strong>Movie:</strong></td>
                      <td style="padding: 5px 0;">${
                        booking.show.movie.title
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0;"><strong>Date:</strong></td>
                      <td style="padding: 5px 0;">${new Date(
                        booking.show.showDateTime
                      ).toLocaleDateString("en-GB", {
                        timeZone: "Asia/Kolkata",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0;"><strong>Time:</strong></td>
                      <td style="padding: 5px 0;">${new Date(
                        booking.show.showDateTime
                      ).toLocaleTimeString("en-US", {
                        timeZone: "Asia/Kolkata",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0;"><strong>Seats:</strong></td>
                      <td style="padding: 5px 0;">${booking.bookedSeats.join(
                        ", "
                      )}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0;"><strong>Amount:</strong></td>
                      <td style="padding: 5px 0;">₹${booking.amount}</td>
                    </tr>
                  </table>

                  <p>Enjoy the show! 🍿</p>
                </td>
              </tr>

              <tr>
                <td bgcolor="#333333" style="padding: 20px 30px 20px 30px;">
                  <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color: #ffffff; font-size: 14px;">
                        &copy; 2025 Get your Popcorn Team. All rights reserved.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

    </body>
    </html>`,
    });
  }
);

export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatsAndDeleteBooking,
  sendBookingConfirmationEmail,
];
