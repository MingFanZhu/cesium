uniform sampler2D u_histogram;
uniform sampler2D u_previous;
uniform bool u_history;
uniform bool u_locked;
uniform vec2 u_percentiles;
uniform vec2 u_limits;
uniform vec2 u_speeds;
uniform float u_seconds;
uniform float u_compensation;
uniform float u_manualExposure;

void main()
{
    vec4 previous = vec4(0.0);
    if (u_history) { previous = texelFetch(u_previous, ivec2(0), 0); }
    float current = previous.g;
    float target = previous.b;
    float meanLog = previous.a;
    if (!u_locked || !u_history)
    {
        float total = 0.0;
        for (int bin = 0; bin < 64; ++bin)
        {
            total += texelFetch(u_histogram, ivec2(bin, 0), 0).r;
        }
        vec2 bounds = total * u_percentiles;
        float cumulative = 0.0;
        float weight = 0.0;
        float weightedLog = 0.0;
        for (int bin = 0; bin < 64; ++bin)
        {
            vec2 h = texelFetch(u_histogram, ivec2(bin, 0), 0).rg;
            float retained = max(0.0, min(cumulative + h.x, bounds.y) - max(cumulative, bounds.x));
            if (h.x > 0.0)
            {
                weightedLog += h.y * (retained / h.x);
                weight += retained;
            }
            cumulative += h.x;
        }
        meanLog = weightedLog / weight;
        target = clamp(log2(0.18) - meanLog, u_limits.x, u_limits.y);
        if (!u_history)
        {
            current = target;
        }
        else
        {
            float delta = target - current;
            float distance = abs(delta);
            // Bright surroundings require lower gain (Speed Up in UE terminology).
            float speed = delta < 0.0 ? u_speeds.x : u_speeds.y;
            const float transition = 1.5;
            float linearTime = max(distance - transition, 0.0) / speed;
            if (u_seconds < linearTime)
            {
                current += sign(delta) * speed * u_seconds;
            }
            else
            {
                float remaining = min(distance, transition) * exp(-speed * (u_seconds - linearTime) / transition);
                current = target - sign(delta) * remaining;
            }
        }
    }
    // Limits also apply immediately when edited while gain is locked.
    current = clamp(current, u_limits.x, u_limits.y);
    out_FragColor = vec4(exp2(-current - u_compensation) / u_manualExposure, current, target, meanLog);
}
