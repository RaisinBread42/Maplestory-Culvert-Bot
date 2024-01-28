
module.exports = {
    isSunday: function isSunday(){
        if(new Date().getDay() == 0) return true; 
        return false;
    },
    nextSundayDate: function nextSundayDate(dayIndex) {
        var today = new Date();
        today.setDate(today.getDate() + (dayIndex - 1 - today.getDay() + 7) % 7 + 1);
        return today;
    }
}