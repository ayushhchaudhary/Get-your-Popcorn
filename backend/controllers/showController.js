import axios from "axios";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import https from "https"; // Import https module for custom agent
import { inngest } from "../inngest/index.js";

// --- Utility function for retries ---
// This function helps handle intermittent network errors like ECONNRESET
async function makeRequestWithRetry(
  url,
  config,
  maxRetries = 6,
  initialDelay = 500
) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const response = await axios.get(url, config); // This function is designed for GET requests
      return response; // Return the full response object
    } catch (error) {
      // Log the error for debugging
      console.error(
        `[Axios Request Failed] URL: ${url}, Error Code: ${error.code}, Message: ${error.message}`
      );

      // Check if it's a retryable network error
      if (
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ERR_NETWORK"
      ) {
        console.warn(
          `[Retry Attempt ${
            retries + 1
          }/${maxRetries}] Retrying connection for ${url}...`
        );
        retries++;
        const delay = initialDelay * Math.pow(2, retries - 1); // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      // Check for SSL certificate error (specific to college network issue)
      else if (error.code === "SELF_SIGNED_CERT_IN_CHAIN") {
        console.error(`[SSL Error] Self-signed certificate in chain for ${url}. This often indicates a proxy/firewall issue.
                                Consider setting NODE_TLS_REJECT_UNAUTHORIZED=0 for development ONLY.
                                If you're using a custom httpsAgent, ensure it's configured correctly.`);
        throw error; // This error is usually not retryable automatically unless you change network or configuration
      } else {
        // Re-throw other types of errors immediately (e.g., 400s, 500s from API, invalid JSON)
        console.error(
          `[Fatal Error] Request to ${url} failed with unretryable error:`,
          error.message
        );
        throw error;
      }
    }
  }
  // If all retries fail, throw an error
  throw new Error(
    `Failed to fetch data from ${url} after ${maxRetries} attempts.`
  );
}

// --- Optional: HTTPS Agent for development on networks with SSL inspection ---
// IMPORTANT: This should be conditionally applied in development, NOT in production.
// You might want to use an environment variable like process.env.NODE_ENV === 'development'
const agent = new https.Agent({
  // Set to false ONLY if NODE_ENV is NOT 'production'
  // Ensure you set NODE_ENV=production when deploying to production
  rejectUnauthorized: process.env.NODE_ENV !== "production",
});

//API to get currently playing movies from TMDB API
export const getNowPlayingMovies = async (req, res) => {
  try {
    // Configuration for the Axios request
    const config = {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      httpsAgent: agent, // Apply the custom agent for development SSL issues
    };

    // Use the retry mechanism for the TMDB API call
    const response = await makeRequestWithRetry(
      "https://api.themoviedb.org/3/movie/now_playing",
      config
    );

    const movies = response.data.results; // Access data from the response object
    res.json({ success: true, movies: movies });
  } catch (error) {
    console.error("Error in getNowPlayingMovies:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//API to add a new show to the database
export const addShow = async (req, res) => {
  try {
    const { movieId, showsInput, showPrice } = req.body;

    // Basic validation
    if (!movieId || !showsInput || showsInput.length === 0 || !showPrice) {
      return res
        .status(400)
        .json({ success: false, message: "Required fields missing." });
    }

    let movie = await Movie.findById(movieId);
    if (!movie) {
      // Configuration for the Axios requests to TMDB
      const config = {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        httpsAgent: agent, // Apply the custom agent for development SSL issues
      };

      //fetch movie details and credits from TMDB API
      const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
        makeRequestWithRetry(
          `https://api.themoviedb.org/3/movie/${movieId}`,
          config
        ),
        makeRequestWithRetry(
          `https://api.themoviedb.org/3/movie/${movieId}/credits`,
          config
        ),
      ]);

      const movieApiData = movieDetailsResponse.data;
      const movieCreditsData = movieCreditsResponse.data;

      const MovieDetails = {
        _id: movieId, // Use TMDB's movie ID as your _id
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        genres: movieApiData.genres,
        casts: movieCreditsData.cast,
        release_date: movieApiData.release_date,
        original_language: movieApiData.original_language,
        tagline: movieApiData.tagline || "",
        vote_average: movieApiData.vote_average,
        runtime: movieApiData.runtime,
      };
      //adding movie to the database.
      movie = await Movie.create(MovieDetails);
    }

    const showsToCreate = [];
    showsInput.forEach((show) => {
      const showDate = show.date;
      // Assuming `show.time` is an array of times for a given date
      if (Array.isArray(show.time)) {
        show.time.forEach((time) => {
          const dateTimeString = `${showDate}T${time}`;
          showsToCreate.push({
            movie: movieId,
            showDateTime: new Date(dateTimeString),
            showPrice,
            occupiedSeats: {}, // Initialize as empty object
          });
        });
      } else {
        // Handle case where show.time might be a single string if your frontend sends it differently
        const dateTimeString = `${showDate}T${show.time}`;
        showsToCreate.push({
          movie: movieId,
          showDateTime: new Date(dateTimeString),
          showPrice,
          occupiedSeats: {},
        });
      }
    });

    if (showsToCreate.length > 0) {
      await Show.insertMany(showsToCreate);
    }

    //Trigger inngest event
    await inngest.send({
      name: "app/show.added",
      data: {movieTitle: movie.title}
    })

    res.json({ success: true, message: "Show Added successfully." });
  } catch (error) {
    console.error("Error in addShow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//API to get all shows from the database

export const getShows = async (req, res) => {
  try {
    const shows = await Show.find({ showDateTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDateTime: 1 });

    //filter unique shows (assuming unique by movie ID)
    // This logic might need refinement if you truly want unique *shows* not unique *movies that have shows*
    const uniqueMovies = new Map(); // Use a Map to maintain order and uniqueness
    shows.forEach((show) => {
      if (show.movie && !uniqueMovies.has(show.movie._id.toString())) {
        uniqueMovies.set(show.movie._id.toString(), show.movie);
      }
    });

    res.json({ success: true, shows: Array.from(uniqueMovies.values()) });
  } catch (error) {
    console.error("Error in getShows:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//API to get a single show from the database
export const getShow = async (req, res) => {
  try {
    const { movieId } = req.params;
    //get all upcoming shows for the movie

    const shows = await Show.find({
      movie: movieId,
      showDateTime: {
        $gte: new Date(),
      },
    }).sort({ showDateTime: 1 }); // Sort to ensure consistent time ordering

    const movie = await Movie.findById(movieId);

    if (!movie) {
      return res
        .status(404)
        .json({ success: false, message: "Movie not found." });
    }

    const dateTime = {};

    shows.forEach((show) => {
      const date = show.showDateTime.toISOString().split("T")[0];
      if (!dateTime[date]) {
        dateTime[date] = [];
      }
      // Ensure times are stored as strings for consistency with frontend
      // and sort them to ensure consistent display
      const timeString = show.showDateTime
        .toISOString()
        .split("T")[1]
        .substring(0, 5); // e.g., "14:30"
      dateTime[date].push({ time: timeString, showId: show._id });
    });

    // Sort times within each date
    for (const date in dateTime) {
      dateTime[date].sort((a, b) => a.time.localeCompare(b.time));
    }

    res.json({ success: true, movie, dateTime });
  } catch (error) {
    console.error("Error in getShow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
