export type Profile = {
    fid: number;
    name: string;
    username: string;
    pfp?: string;
    bio?: string;
    url?: string;
    // location?: string;
    // twitter?: string;
    // github?: string;
};

export type NeynarCastResponse = {
    hash: string;
    authorFid: number;
    text: string;
};

export type Cast = {
    hash: string;
    authorFid: number;
    text: string;
    profile: Profile;
    inReplyTo?: {
        hash: string;
        fid: number;
    };
    timestamp: Date;
};

export type CastId = {
    hash: string;
    fid: number;
};

export type FidRequest = {
    fid: number;
    pageSize: number;
};

export enum ActionTimelineType {
    ForYou = "foryou",
    Following = "following",
}

/**
 * Represents a UUID string in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;
