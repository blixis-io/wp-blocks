<?php
/**
 * Global WordPress hook stubs for storage registration tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

/**
 * Capture an action hook.
 *
 * @param string $hook Value.
 * @param mixed  $callback Value.
 * @param int    $priority Value.
 * @param int    $accepted_args Value.
 */
function add_action( string $hook, mixed $callback, int $priority = 10, int $accepted_args = 1 ): void { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	\Blixis\Builder\Storage\HookState::$actions[ $hook ][] = [ $callback, $priority, $accepted_args ];
}

/**
 * Capture a filter hook.
 *
 * @param string $hook Value.
 * @param mixed  $callback Value.
 * @param int    $priority Value.
 * @param int    $accepted_args Value.
 */
function add_filter( string $hook, mixed $callback, int $priority = 10, int $accepted_args = 1 ): void { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	\Blixis\Builder\Storage\HookState::$filters[ $hook ][] = [ $callback, $priority, $accepted_args ];
}

/**
 * Preserve the default post-type list in this fixture.
 *
 * @param string $hook Value.
 * @param mixed  $value Value.
 * @param mixed  ...$args Additional filter arguments.
 */
function apply_filters( string $hook, mixed $value, mixed ...$args ): mixed { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	unset( $hook, $args );
	return $value;
}

/**
 * Return whether the fake post type is known.
 *
 * @param string $post_type Value.
 */
function post_type_exists( string $post_type ): bool { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	return \in_array( $post_type, [ 'post', 'page' ], true );
}

/**
 * Return public REST support for the fake post type.
 *
 * @param string $post_type Value.
 */
function get_post_type_object( string $post_type ): ?\stdClass { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	return post_type_exists( $post_type ) ? (object) [
		'public'       => true,
		'show_in_rest' => true,
	] : null;
}

/**
 * A single fixture post has ID 5.
 *
 * @param mixed $post_id Value.
 */
function get_post_type( mixed $post_id = null ): string|false { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	return 5 === $post_id ? 'post' : false;
}

/**
 * Fake current-user post editing.
 *
 * @param string $cap Value.
 * @param mixed  ...$args Value.
 */
function current_user_can( string $cap, mixed ...$args ): bool { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	return 'edit_post' === $cap && 5 === ( $args[0] ?? null ) && \Blixis\Builder\Storage\HookState::$can_edit;
}

/**
 * Capture fixed-key registration.
 *
 * @param string               $post_type Value.
 * @param string               $key Value.
 * @param array<string, mixed> $args Value.
 */
function register_post_meta( string $post_type, string $key, array $args ): void { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	\Blixis\Builder\Storage\HookState::$meta[] = [ $post_type, $key, $args ];
}

/**
 * Map edit_post to a visible primitive capability in the fixture.
 *
 * @param string $cap Value.
 * @param int    $user_id Value.
 * @param mixed  ...$args Value.
 * @return list<string> Required capabilities.
 */
function map_meta_cap( string $cap, int $user_id, mixed ...$args ): array { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.
	return [ 'edit_post' === $cap && 5 === ( $args[0] ?? null ) ? 'edit_posts' : 'do_not_allow' ];
}
