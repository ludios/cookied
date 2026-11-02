/** A password to check, and the argon2 PHC string to check it against */
export type CheckRequest = {
    password: string;
    hash: string;
};
/** Whether the password matches the PHC string, or the message of the Error that the check threw */
export type CheckReply = {
    matches: boolean;
} | {
    error: string;
};
