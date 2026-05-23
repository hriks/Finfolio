import uuid from 'react-native-uuid';
export const newId = (): string => uuid.v4() as string;
