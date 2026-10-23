uniform int u_rangeWidth;
int lowerBound(int key) {
    int lo = 0;
    int hi = u_capacity;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (int(fluidRead(u_sorted, mid).x) < key) { lo = mid + 1; }
        else { hi = mid; }
    }
    return lo;
}
void main() {
    int key = int(gl_FragCoord.y) * u_rangeWidth + int(gl_FragCoord.x);
    out_FragColor = vec4(float(lowerBound(key)), float(lowerBound(key + 1)), 0.0, 0.0);
}
