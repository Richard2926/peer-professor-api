"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Helper_1 = require("../entity/Helper");
const PendingApplication_1 = require("../entity/PendingApplication");
const Assignment_1 = require("../entity/Assignment");
const typeorm_1 = require("typeorm");
const constants_1 = require("../constants");
const passport_1 = require("../passport");
const CourseHistory_1 = require("../entity/CourseHistory");
const Student_1 = require("../entity/Student");
const Payment_1 = require("../entity/Payment");
const Review_1 = require("../entity/Review");
const Notification_1 = require("../entity/Notification");
const server_1 = require("../server");
const router = express_1.default.Router();
/**
 * @swagger
 * /helper/apply:
 *    post:
 *      responses:
 *        '200':
 *          description: Applied to assignment!
 *        '452':
 *          description: You are not a registered helper
 *        '453':
 *          description: You cannot apply as a helper to your own assignment
 *        '454':
 *          description: You already applied to this assignment
 *        '455':
 *          description: Exceeded max simultaneous applications
 *        '456':
 *          description: This assignment does not exist
 *        '500':
 *          description: Error
 */
router.post("/apply", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const studentID = req.user.id;
        const { assignmentID } = req.body;
        const helper = yield Helper_1.Helper.findOne(studentID);
        const student = yield Student_1.Student.findOne(studentID);
        if (!helper || !student) {
            return res.status(452).json({ error: "This student is not a helper" });
        }
        const creatorID = (yield typeorm_1.getManager().query(`
        SELECT creator_id
        FROM Assignment
        WHERE id = ?
        `, [assignmentID]))[0].creator_id;
        if (creatorID === studentID) {
            return res.status(453).json({
                error: "You cannot apply as a helper to your own assignment",
            });
        }
        const didAlreadyApply = yield PendingApplication_1.PendingApplication.findOne({
            assignment_id: assignmentID,
            helper_id: studentID,
        });
        if (didAlreadyApply) {
            return res.status(454).json({
                error: "You already applied to this assignment",
            });
        }
        const pendingApplicationsCount = yield typeorm_1.getManager().query(`
        SELECT COUNT(*)
        FROM PendingApplication
        WHERE helper_id = ?
        `, [studentID]);
        if (pendingApplicationsCount > constants_1.simultaneousApplicationLimit) {
            return res.status(455).json({
                error: `You can only apply to ${constants_1.simultaneousApplicationLimit} assignments at once`,
            });
        }
        const assignment = yield Assignment_1.Assignment.findOne(assignmentID);
        if (!assignment) {
            return res.status(456).json({
                error: `This assignment does not exist`,
            });
        }
        const pendingApplication = new PendingApplication_1.PendingApplication();
        pendingApplication.helper_id = studentID;
        pendingApplication.assignment_id = assignmentID;
        const notification = new Notification_1.Notification();
        notification.text = "New Application: " + student.username + " applied to " + assignment.name;
        notification.url = "/home/homework/" + assignmentID + "?applicant=" + student.username;
        notification.student_id = assignment.creator_id;
        yield Promise.all([pendingApplication.save(), notification.save()]);
        return res.sendStatus(200);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
 * @swagger
 * /helper/listApplications:
 *    post:
 *      responses:
 *        '200':
 *          description: Returned all pending applications for this user
 *        '500':
 *          description: Error
 */
router.get("/listApplications", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const studentID = req.user.id;
        const pendingApplications = yield typeorm_1.getManager().query(`
        SELECT 
        PendingApplication.id as pendingApplicationID,
        Assignment.id as assignmentID,
        Assignment.name as assignmentName,
        Course.department as courseDepartment,
        Course.name as courseName,
        Course.course_no as courseNumber
        FROM PendingApplication
        JOIN Assignment
        ON Assignment.id = PendingApplication.assignment_id
        JOIN Course
        ON Course.id = Assignment.course_id
        WHERE PendingApplication.helper_id = ?
        AND Assignment.active is True
      `, [studentID]);
        return res.status(200).json(pendingApplications);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
 * @swagger
 * /helper/deleteApplication:
 *    post:
 *      responses:
 *        '200':
 *          description: Successfully Deleted
 *        '452':
 *          description: This application does not exist
 *        '453':
 *          description: You do not have permission to delete this application
 *        '500':
 *          description: Error
 */
router.delete("/deleteApplication", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const { applicationID } = req.body;
        const studentID = req.user.id;
        const pendingApplication = yield PendingApplication_1.PendingApplication.findOne(applicationID);
        if (!pendingApplication) {
            return res
                .status(452)
                .json({ error: "This application does not exist" });
        }
        if (pendingApplication.helper_id !== studentID) {
            return res.status(453).json({
                error: "You do not have permission to delete this application",
            });
        }
        yield pendingApplication.remove();
        return res.sendStatus(200);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
 * @swagger
 * /helper/updateProfile:
 *    put:
 *      summary: update bio
 *      responses:
 *        '200':
 *          description: Updated helper profile
 *        '452':
 *          description: This student is not a helper
 *        '500':
 *          description: Error
 */
router.put("/updateProfile", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const studentID = req.user.id;
        const { bio } = req.body;
        const helper = yield Helper_1.Helper.findOne(studentID);
        if (!helper) {
            return res.status(452).json({ error: "This student is not a helper" });
        }
        yield typeorm_1.getConnection()
            .createQueryBuilder()
            .update(Helper_1.Helper)
            .set({ bio: bio })
            .where("id = :id", { id: studentID })
            .execute();
        return res.sendStatus(200);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
 * @swagger
 * /helper/becomeHelper:
 *    put:
 *      summary: Become a helper
 *      responses:
 *        '200':
 *          description: Student marked as helper
 *        '500':
 *          description: Error
 */
router.post("/becomeHelper", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const studentID = req.user.id;
        const { bio, courseHistoryIds } = req.body;
        const student = yield Student_1.Student.findOneOrFail({
            id: studentID,
        });
        if (!student || student.payouts_enabled == false) {
            return res.status(452).json({ error: "Not a valid request" });
        }
        const helper = new Helper_1.Helper();
        helper.student_id = studentID;
        helper.bio = bio;
        helper.balance = 0;
        yield helper.save();
        const query = `SELECT course_id 
      FROM CourseHistory
      WHERE helper_id = (?)`;
        let ids = yield typeorm_1.getManager().query(query, [helper.student_id]);
        ids = ids.map((id) => {
            return id.course_id;
        });
        const courseHistoryCollection = courseHistoryIds.map((courseId) => {
            if (!ids.includes(courseId)) {
                const course_history = new CourseHistory_1.CourseHistory();
                course_history.helper = helper;
                course_history.course = courseId;
                return course_history.save();
            }
        });
        for (const id of ids) {
            if (!courseHistoryIds.includes(id)) {
                let task = typeorm_1.getManager().query(`
              DELETE
              FROM CourseHistory
              WHERE course_id = ?
              AND helper_id = ?
              `, [id, helper.student_id]);
                courseHistoryCollection.push(task);
            }
        }
        yield Promise.all(courseHistoryCollection);
        return res.sendStatus(200);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
 * @swagger
 * /helper/bankTransfer:
 *    post:
 *      summary: Transfer partial or complete balance to their connected bank account
 *      responses:
 *        '200':
 *          description: Applied to assignment!
 *        '400':
 *          description: Please make a request within your balance!
 *        '500':
 *          description: Error
 */
router.post("/bankTransfer", function (_req, _res) { });
/**
 * @swagger
 * /helper/reviewHelper:
 *    post:
 *      summary: Review a Helper
 *      responses:
 *        '200':
 *          description: Posted Review!
 *        '452':
 *          description: Not authorized to review
 *        '500':
 *          description: Error
 */
router.post("/reviewHelper", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const studentID = req.user.id;
        const { helperID, text, rating } = req.body;
        const payment = yield Payment_1.Payment.findOne({
            student_id: studentID,
            helper_id: helperID
        });
        if (!payment) {
            return res.status(452).json({ error: "You need to have a completed transaction with the helper in order to review them!" });
        }
        const old_review = yield Review_1.Review.findOne({
            student_id: studentID,
            helper_id: helperID
        });
        if (old_review) {
            yield typeorm_1.getManager().query(`
          DELETE
          FROM Review
          WHERE student_id = ?
          AND helper_id = ?
          `, [studentID, helperID]);
        }
        const review = new Review_1.Review();
        review.student_id = studentID;
        review.helper_id = helperID;
        review.rating = rating;
        review.text = text;
        yield typeorm_1.getConnection().manager.save(review);
        return res.sendStatus(200);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
* @swagger
* /helper/getBalanceData:
*    get:
*      responses:
*        '200':
*          description: Returned all transactions for this user
*        '500':
*          description: Error
*/
router.get("/getBalanceData", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const helperID = req.user.id;
        const helper = yield Helper_1.Helper.findOneOrFail({
            student_id: helperID,
        });
        const query = `
      SELECT Milestone.title,
      amount,
      Payment.created_at
      FROM Payment
      LEFT JOIN Milestone
      ON Milestone.id = Payment.milestone_id
      WHERE Payment.helper_id = ?
      ORDER BY Payment.created_at DESC `;
        const paymentHistory = yield typeorm_1.getManager().query(query, [helperID]);
        return res.status(200).json({ paymentHistory, helper });
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
/**
* @swagger
* /helper/getOnboardLink:
*    get:
*      responses:
*        '200':
*          description: Returns onboard link if helper stripe is not connected
*        '500':
*          description: Error
*/
router.get("/getOnboardLink", passport_1.accessMiddleware, (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        const student_id = req.user.id;
        const student = yield Student_1.Student.findOneOrFail({
            id: student_id,
        });
        // const account = await stripe.accounts.retrieve(student.stripe_id);
        // console.log(account);
        const return_url = "http://localhost:3001/home/user/" +
            student.username +
            "?onboard=true";
        const type = "account_onboarding";
        const accountLink = yield server_1.stripe.accountLinks.create({
            account: student.stripe_id,
            refresh_url: return_url,
            return_url: return_url,
            type: type,
        });
        return res.send(accountLink);
    }
    catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
}));
module.exports = router;
//# sourceMappingURL=helper.js.map