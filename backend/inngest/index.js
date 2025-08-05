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

//Inngest function to send reminder

const sendShowReminder = inngest.createFunction(
  { id: "send-show-reminders" },
  { cron: "0 */8 * * *" }, //Every 8 hours
  async ({ step }) => {
    const now = new Date();
    const in8Hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const windowStart = new Date(in8Hours.getTime() - 10 * 60 * 1000);

    //Prepare reminder tasks

    const reminderTasks = await step.run("prepare-reminder-tasks", async () => {
      const shows = await Show.find({
        showTime: { $gte: windowStart, $lte: in8Hours },
      }).populate("movie");

      const tasks = [];

      for (const show of shows) {
        if (!show.movie || !show.occupiedSeats) continue;

        const userIds = [...new Set(Object.values(show.occupiedSeats))];
        if (userIds.length === 0) continue;

        const users = await User.find({ _id: { $in: userIds } }).select(
          "name email"
        );

        for (const user of users) {
          tasks.push({
            userEmail: user.email,
            userName: user.name,
            movieTitle: show.movie.title,
            showTime: show.showTime,
          });
        }
      }
      return tasks;
    });

    if (reminderTasks.length === 0) {
      return { sent: 0, message: "No reminders to send." };
    }

    //send reminder emails

    const results = await step.run("send-all-reminders", async () => {
      return await Promise.allSettled(
        reminderTasks.map((task) =>
          sendEmail({
            to: task.userEmail,
            subject: `Reminder: Your movie "${task.movieTitle}" starts soon!`,

            body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Hello \${task.userName},</h2>
  <p>This is a quick reminder that your movie:</p>
  <h3 style="color: #F84565;">"${task.movieTitle}"</h3>
  <p>
    is scheduled for <strong>${new Date(task.showTime).toLocaleDateString(
      "en-US",
      { timeZone: "Asia/Kolkata" }
    )}</strong> at
    <strong> ${new Date(task.showTime).toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
    })}</strong>.
  </p>
  <p>It starts in approximately <strong>8 hours</strong> - make sure you're ready!</p>
  <br/>
  <p>Enjoy the show!<br/>-   Team - Get your Popcorn</p>
</div>`,
          })
        )
      );
    });
    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;

    return {
      sent,
      failed,
      message: `Send ${sent} reminder(s), ${failed} failed.`,
    };
  }
);

const sendNewShowNotification = inngest.createFunction(
  { id: "send-new-show-notification" },
  { event: "app/show.added" },
  async ({ event }) => {
    const { movieTitle } = event.data;

    const users = await User.find({});

    for (const user of users) {
      const userEmail = user.email;
      const userName = user.name;

      const subject = `🎬 New Show Added: ${movieTitle}`;
      const body = `<div style="font-family: Arial, sans-serif; padding: 20px">
        <h2>Hi ${userName}, </h2>
        <p>We've just added a new show to our library:</p>
        <h3 style="color: #F84565;">"${movieTitle}"</h3>
        <p>Visit our website</p>
        <br/>
        <p>Thanks, <br/>Team Get your Popcorn</p>
        </div>`;
      await sendEmail({
        to: userEmail,
        subject,
        body,
      });
    }
    return { message: "Notification sent." };
  }
);

export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatsAndDeleteBooking,
  sendBookingConfirmationEmail,
  sendShowReminder,
  sendNewShowNotification,
];
