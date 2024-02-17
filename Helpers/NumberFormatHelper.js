
module.exports = {
    toLocaleString: function(n) {
        return n.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
    },
}