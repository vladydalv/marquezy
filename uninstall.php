<?php
/**
 * Marquezy uninstall.
 *
 * Removes the plugin's options: the announcement bar settings, the saved
 * shortcodes and the shortcode id counter. Posts that contain the Marquee
 * block or the [marquezy] shortcode are left untouched.
 *
 * @package Marquezy
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'marquezy_options' );
delete_option( 'marquezy_shortcodes' );
delete_option( 'marquezy_shortcodes_next_id' );
