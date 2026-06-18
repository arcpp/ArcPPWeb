// Total length covered by a set of [start, end] intervals, merging overlaps
// (intervals that touch count as contiguous). Pure; returns an integer.
function mergeIntervals(intervals) {
  if (!intervals || intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let currentStart = intervals[0][0];
  let currentEnd = intervals[0][1];

  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart + 1;
      currentStart = start;
      currentEnd = end;
    }
  }
  total += currentEnd - currentStart + 1;
  return total;
}

module.exports = { mergeIntervals };
