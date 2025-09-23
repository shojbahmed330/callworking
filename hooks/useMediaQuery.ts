import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches);

    useEffect(() => {
        const mediaQueryList = window.matchMedia(query);
        const listener = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // The 'change' event is more performant than 'resize'
        mediaQueryList.addEventListener('change', listener);

        // Cleanup the listener on component unmount
        return () => {
            mediaQueryList.removeEventListener('change', listener);
        };
    }, [query]); // Re-run effect if query string changes

    return matches;
};
