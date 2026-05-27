"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { BoardPerson } from "@/lib/board-constants";

export interface PlaybackStep {
  person: BoardPerson;
  delay: number;
}

export interface UseDemoPlaybackReturn {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  total: number;
  currentPerson: string | null;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function generatePlaybackSteps(
  people: BoardPerson[]
): PlaybackStep[] {
  return people.map((person, i) => ({
    person,
    delay: i === 0 ? 300 : 400 + Math.random() * 400,
  }));
}

export function useDemoPlayback(
  steps: PlaybackStep[],
  onStep: (person: BoardPerson) => void,
  onComplete: () => void
): UseDemoPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPerson, setCurrentPerson] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0);
  const stepsRef = useRef(steps);
  const onStepRef = useRef(onStep);
  const onCompleteRef = useRef(onComplete);

  // Keep refs in sync
  stepsRef.current = steps;
  onStepRef.current = onStep;
  onCompleteRef.current = onComplete;

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleStep = useCallback(
    (index: number) => {
      const currentSteps = stepsRef.current;
      if (index >= currentSteps.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentPerson(null);
        onCompleteRef.current();
        return;
      }

      const step = currentSteps[index];
      timeoutRef.current = setTimeout(() => {
        onStepRef.current(step.person);
        setProgress(index + 1);
        setCurrentPerson(step.person.name);
        progressRef.current = index + 1;
        scheduleStep(index + 1);
      }, step.delay);
    },
    []
  );

  const play = useCallback(() => {
    clearCurrentTimeout();
    setIsPlaying(true);
    setIsPaused(false);
    setProgress(0);
    setCurrentPerson(null);
    progressRef.current = 0;
    scheduleStep(0);
  }, [clearCurrentTimeout, scheduleStep]);

  const pause = useCallback(() => {
    clearCurrentTimeout();
    setIsPaused(true);
  }, [clearCurrentTimeout]);

  const resume = useCallback(() => {
    setIsPaused(false);
    scheduleStep(progressRef.current);
  }, [scheduleStep]);

  const stop = useCallback(() => {
    clearCurrentTimeout();
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentPerson(null);
    progressRef.current = 0;
  }, [clearCurrentTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCurrentTimeout();
    };
  }, [clearCurrentTimeout]);

  return {
    isPlaying,
    isPaused,
    progress,
    total: steps.length,
    currentPerson,
    play,
    pause,
    resume,
    stop,
  };
}
