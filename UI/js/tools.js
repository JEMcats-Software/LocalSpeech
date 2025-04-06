function getUrlParam(input) {
    const urlParams = new URLSearchParams(window.location.search);
    const param = urlParams.get(input);
    return param;
}