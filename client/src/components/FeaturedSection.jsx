import { ArrowRight } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import BlurCircle from "./BlurCircle"; // Assuming this path is correct
import MovieCard from "./MovieCard";   // Assuming this path is correct
import { useAppContext } from "../context/AppContext"; // Correct path to your context

const FeaturedSection = () => {
  const navigate = useNavigate();
  // Destructure 'shows' and 'showsLoading' from your context
  const { shows, showsLoading } = useAppContext();

  console.log("FeaturedSection: Component rendered.");
  console.log("FeaturedSection: Current shows state:", shows);
  console.log("FeaturedSection: Current showsLoading state:", showsLoading);

  return (
    <div className="px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden"> {/* Added py-20 back for spacing */}
      <div className="relative flex items-center justify-between pt-20 pb-10">
        <BlurCircle top="0" right="-80px" />
        <p className="text-gray-300 font-medium text-lg">Now Showing</p>
        <button
          onClick={() => navigate("/movies")}
          className="group flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          View All
          <ArrowRight className="group-hover:translate-x-0.5 transition w-4.5 h-4.5" />
        </button>
      </div>

      <div className="flex flex-wrap max-sm:justify-center gap-8 mt-8">
        {showsLoading ? (
          // Display a loading indicator when shows are being fetched
          <p className="text-gray-400 text-lg mx-auto">Loading shows...</p>
        ) : shows && shows.length > 0 ? (
          // Render MovieCards if shows are loaded and the array is not empty
          shows.slice(0, 4).map((show) => (
            <MovieCard key={show._id} movie={show} />
          ))
        ) : (
          <p className="text-gray-400 text-lg mx-auto">No shows available at the moment.</p>
        )}
      </div>

      <div className="flex justify-center mt-20">
        <button
          onClick={() => {
            navigate("/movies");
            window.scrollTo(0, 0); 
          }}
          className="px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-md font-medium cursor-pointer">
          Show more
        </button>
      </div>
    </div>
  );
};

export default FeaturedSection;