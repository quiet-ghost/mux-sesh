# Platform binary selection shared by bin/mux-sesh and bin/postinstall. Sourced, not executed.

# Prints platform package names in preference order. Arguments: os arch libc avx2(yes|no).
# Keep in sync with Host.candidates in tools/build/targets.ts; tests compare both.
mux_sesh_platform_candidates() {
    _mux_os=$1
    _mux_arch=$2
    _mux_libc=$3
    _mux_avx2=$4

    if [ "$_mux_arch" != x64 ]; then
        _mux_variants=default
    elif [ "$_mux_avx2" = yes ]; then
        _mux_variants="default baseline"
    else
        _mux_variants="baseline default"
    fi

    if [ "$_mux_os" != linux ]; then
        _mux_libcs=none
    elif [ "$_mux_libc" = musl ]; then
        _mux_libcs="musl glibc"
    else
        _mux_libcs="glibc musl"
    fi

    for _mux_candidate_libc in $_mux_libcs; do
        for _mux_variant in $_mux_variants; do
            _mux_name="mux-sesh-$_mux_os-$_mux_arch"

            if [ "$_mux_variant" = baseline ]; then
                _mux_name="$_mux_name-baseline"
            fi

            if [ "$_mux_candidate_libc" = musl ]; then
                _mux_name="$_mux_name-musl"
            fi

            printf '%s\n' "$_mux_name"
        done
    done
}

# Sets mux_sesh_os, mux_sesh_arch, mux_sesh_libc, and mux_sesh_avx2 for this machine.
# Most hosts are answered by builtins plus one uname call, keeping launch overhead low.
mux_sesh_detect_host() {
    mux_sesh_uname="$(uname -s -m)"

    case "${mux_sesh_uname%% *}" in
        Linux) mux_sesh_os=linux ;;
        Darwin) mux_sesh_os=darwin ;;
        *) mux_sesh_os=unsupported ;;
    esac

    case "${mux_sesh_uname##* }" in
        x86_64 | amd64) mux_sesh_arch=x64 ;;
        aarch64 | arm64) mux_sesh_arch=arm64 ;;
        *) mux_sesh_arch=unsupported ;;
    esac

    # Alpine marks itself and a glibc loader means glibc; other systems name their libc in ldd.
    mux_sesh_libc=none

    if [ "$mux_sesh_os" != linux ]; then
        :
    elif [ -f /etc/alpine-release ]; then
        mux_sesh_libc=musl
    elif [ -e /lib64/ld-linux-x86-64.so.2 ] || [ -e /lib/ld-linux-aarch64.so.1 ]; then
        mux_sesh_libc=glibc
    elif ldd --version 2>&1 | grep -qi musl; then
        mux_sesh_libc=musl
    else
        mux_sesh_libc=glibc
    fi

    # Bun's default x64 runtime needs AVX2. Unknown support answers no, so baseline builds come first.
    mux_sesh_avx2=no

    if [ "$mux_sesh_arch" != x64 ]; then
        :
    elif [ "$mux_sesh_os" = linux ]; then
        if grep -qw avx2 /proc/cpuinfo 2>/dev/null; then mux_sesh_avx2=yes; fi
    elif [ "$mux_sesh_os" = darwin ]; then
        if [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null)" = 1 ]; then mux_sesh_avx2=yes; fi
    fi
}

# Prints the best installed platform binary. npm nests it under the package; bun and pnpm hoist it beside.
mux_sesh_find_binary() {
    _mux_root=$1
    mux_sesh_detect_host

    if [ "$mux_sesh_os" = unsupported ] || [ "$mux_sesh_arch" = unsupported ]; then
        return 1
    fi

    for _mux_name in $(mux_sesh_platform_candidates "$mux_sesh_os" "$mux_sesh_arch" "$mux_sesh_libc" "$mux_sesh_avx2"); do
        _mux_dir=$_mux_root

        while :; do
            _mux_binary="$_mux_dir/node_modules/$_mux_name/bin/mux-sesh"

            if [ -f "$_mux_binary" ] && [ -x "$_mux_binary" ]; then
                printf '%s\n' "$_mux_binary"
                return 0
            fi

            if [ -z "$_mux_dir" ] || [ "$_mux_dir" = / ]; then
                break
            fi

            _mux_dir=${_mux_dir%/*}
        done
    done

    return 1
}

mux_sesh_missing_binary_message() {
    mux_sesh_detect_host

    if [ "$mux_sesh_os" = unsupported ] || [ "$mux_sesh_arch" = unsupported ]; then
        printf 'mux-sesh has no prebuilt binary for %s %s.\n' "$(uname -s)" "$(uname -m)"
        printf 'Supported platforms: Linux x64/arm64 (glibc or musl) and macOS x64/arm64.\n'
        return 0
    fi

    _mux_platform="$mux_sesh_os-$mux_sesh_arch"

    if [ "$mux_sesh_os" = linux ]; then
        _mux_platform="$_mux_platform ($mux_sesh_libc)"
    fi

    _mux_expected=$(mux_sesh_platform_candidates "$mux_sesh_os" "$mux_sesh_arch" "$mux_sesh_libc" "$mux_sesh_avx2" | head -n 1)
    printf 'mux-sesh could not find its prebuilt binary for %s.\n' "$_mux_platform"
    printf 'It ships in the optional dependency %s, which was not installed.\n' "$_mux_expected"
    printf 'Optional dependencies are skipped by --omit=optional, --no-optional, or a lockfile made on another platform.\n'
    printf 'Reinstall with optional dependencies enabled: npm install -g mux-sesh (or bun install -g mux-sesh).\n'
}
