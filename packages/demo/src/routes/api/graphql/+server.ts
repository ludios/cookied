import { createYoga } from "graphql-yoga";
import { renderGraphiQL } from "@graphql-yoga/render-graphiql";
import SchemaBuilder from "@pothos/core";
import type { RequestEvent } from "@sveltejs/kit";
import { PrismaPlugin } from "@pothos/plugin-prisma";

const builder = new SchemaBuilder({
	plugins: [PrismaPlugin],
});

builder.prismaNode('Session', {
	id: { field: 'id' },
	fields: (t) => ({
		user_id: t.exposeNumber('user_id'),
		user_agent_seen_first: t.exposeString('user_agent_seen_first'),
	}),
});


builder.queryType({
	fields: (t) => ({
		hello: t.string({
			args: {
				name: t.arg.string({ required: true }),
			},
			resolve: (parent, { name }) => `Hello, ${name}!`,
		}),
	}),
});

const yogaApp = createYoga<RequestEvent>({
	logging: false,
	schema: builder.toSchema(),
	// https://github.com/dotansimha/graphql-yoga/issues/3091#issuecomment-1787809658
	fetchAPI: { Response },
	renderGraphiQL,
	graphiql: {
		defaultQuery: `query Hello {
	hello(name: "you")
}`,
	},
});

export async function GET(event: RequestEvent) {
	return yogaApp.handleRequest(event.request, event);
}

export async function POST(event: RequestEvent) {
	return yogaApp.handleRequest(event.request, event);
}
