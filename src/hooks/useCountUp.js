import { useState, useEffect } from 'react';

/**
 * Returns a number that increments from `start` to `end` over `duration` ms.
 * Used for animated metric counters.
 */
export function useCountUp(end, duration = 1200, start = 0) {
    const [value, setValue] = useState(start);

    useEffect(() => {
        let startTime = null;
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(start + (end - start) * eased);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [end, duration, start]);

    return value;
}

/** Simple interval hook */
export function useInterval(callback, delay) {
    useEffect(() => {
        if (delay == null) return;
        const id = setInterval(callback, delay);
        return () => clearInterval(id);
    }, [callback, delay]);
}
