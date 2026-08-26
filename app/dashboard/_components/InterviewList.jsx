import React from "react";
import InterviewItemCard from "./InterviewItemCard";

const InterviewList = ({ interviews = [] }) => {
  return (
    <div>
      <h2 className="font-medium text-xl">Previous Mock Interviews</h2>
      {interviews.length === 0 ? (
        <p className="text-sm text-gray-500 my-3">
          You haven&apos;t created any interviews yet. Add one above to get
          started.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 my-3">
          {interviews.map((interview) => (
            <InterviewItemCard interview={interview} key={interview.id} />
          ))}
        </div>
      )}
    </div>
  );
};

export default InterviewList;
